import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
import { checkins, friendships, stories, users, venues } from "../drizzle/schema";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import { storagePut } from "./storage";

const storyInput = z.object({
  mediaData: z.string().min(1).max(12_000_000),
  mediaMime: z.string().min(1).max(100),
  mediaType: z.enum(["image", "video"]),
  audioData: z.string().max(4_000_000).optional(),
  audioMime: z.string().max(100).optional(),
  audioName: z.string().max(255).optional(),
  caption: z.string().max(500).optional(),
  visibility: z.enum(["friends", "public"]).default("friends"),
});

function extensionForMime(mime: string, fallback: string) {
  const cleanMime = mime.split(";")[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
  };
  return extensions[cleanMime] ?? fallback;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  socialsip: router({
    venues: router({
      list: publicProcedure.query(async () => {
        const database = await db.getDb();
        if (!database) return [];
        return await database.select().from(venues).limit(50);
      }),

      create: protectedProcedure
        .input(
          z.object({
            name: z.string().min(2).max(255),
            address: z.string().max(500).optional(),
            city: z.string().max(128).optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const database = await db.getDb();
          if (!database) throw new Error("Database unavailable");
          const result = await database.insert(venues).values({
            name: input.name,
            address: input.address || null,
            city: input.city || null,
          });
          return { id: Number((result as { insertId?: number }).insertId ?? 0), ...input };
        }),
    }),

    checkin: protectedProcedure
      .input(z.object({ venueId: z.number(), note: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new Error("Database unavailable");

        await database
          .update(checkins)
          .set({ status: "ended" })
          .where(and(eq(checkins.userId, ctx.user.id), eq(checkins.status, "active")));

        await database.insert(checkins).values({
          userId: ctx.user.id,
          venueId: input.venueId,
          status: "active",
          note: input.note || null,
        });

        return { success: true };
      }),

    feed: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return { activeCheckin: null, friends: [] };

      const myActive = await database
        .select({
          id: checkins.id,
          venueName: venues.name,
          venueAddress: venues.address,
          createdAt: checkins.createdAt,
          note: checkins.note,
        })
        .from(checkins)
        .innerJoin(venues, eq(checkins.venueId, venues.id))
        .where(and(eq(checkins.userId, ctx.user.id), eq(checkins.status, "active")))
        .limit(1);

      const acceptedFriendships = await database
        .select()
        .from(friendships)
        .where(
          and(
            or(eq(friendships.userId, ctx.user.id), eq(friendships.friendId, ctx.user.id)),
            eq(friendships.status, "accepted"),
          ),
        );

      const friendIds = acceptedFriendships.map((friendship) =>
        friendship.userId === ctx.user.id ? friendship.friendId : friendship.userId,
      );

      const friendsList: Array<{
        id: number;
        name: string;
        email: string | null;
        activeCheckin: { venueName: string; createdAt: Date } | null;
      }> = [];

      for (const friendId of friendIds) {
        const friendUser = await database.select().from(users).where(eq(users.id, friendId)).limit(1);
        if (friendUser.length === 0) continue;

        const friendCheckin = await database
          .select({ venueName: venues.name, createdAt: checkins.createdAt })
          .from(checkins)
          .innerJoin(venues, eq(checkins.venueId, venues.id))
          .where(and(eq(checkins.userId, friendId), eq(checkins.status, "active")))
          .limit(1);

        friendsList.push({
          id: friendUser[0].id,
          name: friendUser[0].name || "Amigo",
          email: friendUser[0].email,
          activeCheckin: friendCheckin.length > 0 ? friendCheckin[0] : null,
        });
      }

      return {
        activeCheckin: myActive.length > 0 ? myActive[0] : null,
        friends: friendsList,
      };
    }),

    stories: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const database = await db.getDb();
        if (!database) return [];

        const acceptedFriendships = await database
          .select()
          .from(friendships)
          .where(
            and(
              or(eq(friendships.userId, ctx.user.id), eq(friendships.friendId, ctx.user.id)),
              eq(friendships.status, "accepted"),
            ),
          );
        const friendIds = new Set(
          acceptedFriendships.map((friendship) =>
            friendship.userId === ctx.user.id ? friendship.friendId : friendship.userId,
          ),
        );

        const rows = await database
          .select({
            id: stories.id,
            userId: stories.userId,
            mediaUrl: stories.mediaUrl,
            mediaType: stories.mediaType,
            audioUrl: stories.audioUrl,
            audioName: stories.audioName,
            caption: stories.caption,
            visibility: stories.visibility,
            createdAt: stories.createdAt,
            expiresAt: stories.expiresAt,
            userName: users.name,
          })
          .from(stories)
          .innerJoin(users, eq(stories.userId, users.id))
          .where(gt(stories.expiresAt, new Date()))
          .orderBy(desc(stories.createdAt));

        return rows.filter(
          (story) =>
            story.userId === ctx.user.id ||
            story.visibility === "public" ||
            (story.visibility === "friends" && friendIds.has(story.userId)),
        );
      }),

      create: protectedProcedure.input(storyInput).mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new Error("Database unavailable");

        const mediaBuffer = Buffer.from(input.mediaData, "base64");
        const mediaExtension = extensionForMime(input.mediaMime, input.mediaType === "video" ? "mp4" : "jpg");
        const mediaUpload = await storagePut(
          `stories/${ctx.user.id}/media.${mediaExtension}`,
          mediaBuffer,
          input.mediaMime,
        );

        let audioUrl: string | null = null;
        if (input.audioData && input.audioMime) {
          const audioBuffer = Buffer.from(input.audioData, "base64");
          const audioExtension = extensionForMime(input.audioMime, "mp3");
          const audioUpload = await storagePut(
            `stories/${ctx.user.id}/audio.${audioExtension}`,
            audioBuffer,
            input.audioMime,
          );
          audioUrl = audioUpload.url;
        }

        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
        const result = await database.insert(stories).values({
          userId: ctx.user.id,
          mediaUrl: mediaUpload.url,
          mediaType: input.mediaType,
          audioUrl,
          audioName: input.audioName || null,
          caption: input.caption || null,
          visibility: input.visibility,
          createdAt,
          expiresAt,
        });

        return { id: Number((result as { insertId?: number }).insertId ?? 0), mediaUrl: mediaUpload.url, audioUrl };
      }),

      remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new Error("Database unavailable");
        await database.delete(stories).where(and(eq(stories.id, input.id), eq(stories.userId, ctx.user.id)));
        return { success: true } as const;
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;

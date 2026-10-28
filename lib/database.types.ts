// Generated from live Supabase schema (project cymhbwgxmezrwofkbdqz)
// Do not edit by hand — regenerate when migrations change.

export type Json =
  | string | number | boolean | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          id: string
          recipient_id: string
          actor_id: string
          type: string
          checkin_id: number | null
          venue_id: number | null
          message: string
          created_at: string
          read_at: string | null
          reaction: string | null
          reaction_emoji: string | null
          story_id: number | null
          friendship_id: number | null
          official_post_id: string | null
          direct_message_id: string | null
          comment_id: string | null
        }
        Insert: {
          id?: string
          recipient_id: string
          actor_id: string
          type: string
          checkin_id?: number | null
          venue_id?: number | null
          message: string
          created_at?: string
          read_at?: string | null
          reaction?: string | null
          reaction_emoji?: string | null
          story_id?: number | null
          friendship_id?: number | null
          official_post_id?: string | null
          direct_message_id?: string | null
          comment_id?: string | null
        }
        Update: {
          id?: string
          recipient_id?: string
          actor_id?: string
          type?: string
          checkin_id?: number | null
          venue_id?: number | null
          message?: string
          created_at?: string
          read_at?: string | null
          reaction?: string | null
          reaction_emoji?: string | null
          story_id?: number | null
          friendship_id?: number | null
          official_post_id?: string | null
          direct_message_id?: string | null
          comment_id?: string | null
        }
        Relationships: []
      }
      activity_push_deliveries: {
        Row: {
          delivery_key: string
          token_id: number
          claimed_at: string
        }
        Insert: {
          delivery_key: string
          token_id: number
          claimed_at?: string
        }
        Update: {
          delivery_key?: string
          token_id?: number
          claimed_at?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          id: number
          user_id: string
          venue_id: number
          status: string
          note: string | null
          created_at: string
          expires_at: string | null
          is_active: boolean
          visibility: string
          excluded_user_ids: string[]
          allowed_user_ids: string[]
        }
        Insert: {
          id?: number
          user_id: string
          venue_id: number
          status?: string
          note?: string | null
          created_at?: string
          expires_at?: string | null
          is_active?: boolean
          visibility?: string
          excluded_user_ids?: string[]
          allowed_user_ids?: string[]
        }
        Update: {
          id?: number
          user_id?: string
          venue_id?: number
          status?: string
          note?: string | null
          created_at?: string
          expires_at?: string | null
          is_active?: boolean
          visibility?: string
          excluded_user_ids?: string[]
          allowed_user_ids?: string[]
        }
        Relationships: []
      }
      close_friends: {
        Row: {
          owner_id: string
          friend_id: string
          created_at: string
        }
        Insert: {
          owner_id: string
          friend_id: string
          created_at?: string
        }
        Update: {
          owner_id?: string
          friend_id?: string
          created_at?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          id: string
          sender_id: string
          recipient_id: string
          body: string
          story_id: number | null
          kind: string
          created_at: string
          read_at: string | null
          client_message_id: string | null
        }
        Insert: {
          id?: string
          sender_id: string
          recipient_id: string
          body: string
          story_id?: number | null
          kind?: string
          created_at?: string
          read_at?: string | null
          client_message_id?: string | null
        }
        Update: {
          id?: string
          sender_id?: string
          recipient_id?: string
          body?: string
          story_id?: number | null
          kind?: string
          created_at?: string
          read_at?: string | null
          client_message_id?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          id: number
          user_id: string
          friend_id: string
          status: string
          created_at: string
          request_message: string | null
        }
        Insert: {
          id?: number
          user_id: string
          friend_id: string
          status?: string
          created_at?: string
          request_message?: string | null
        }
        Update: {
          id?: number
          user_id?: string
          friend_id?: string
          status?: string
          created_at?: string
          request_message?: string | null
        }
        Relationships: []
      }
      notification_action_tokens: {
        Row: {
          id: string
          token_hash: string
          user_id: string
          activity_id: string | null
          expires_at: string
          used_at: string | null
          created_at: string
          friendship_id: string | null
          action_type: string | null
          friendship_id_bigint: number | null
          sender_id: string | null
          recipient_id: string | null
          processing_at: string | null
          lease_id: string | null
          attempts: number
        }
        Insert: {
          id?: string
          token_hash: string
          user_id: string
          activity_id?: string | null
          expires_at?: string
          used_at?: string | null
          created_at?: string
          friendship_id?: string | null
          action_type?: string | null
          friendship_id_bigint?: number | null
          sender_id?: string | null
          recipient_id?: string | null
          processing_at?: string | null
          lease_id?: string | null
          attempts?: number
        }
        Update: {
          id?: string
          token_hash?: string
          user_id?: string
          activity_id?: string | null
          expires_at?: string
          used_at?: string | null
          created_at?: string
          friendship_id?: string | null
          action_type?: string | null
          friendship_id_bigint?: number | null
          sender_id?: string | null
          recipient_id?: string | null
          processing_at?: string | null
          lease_id?: string | null
          attempts?: number
        }
        Relationships: []
      }
      official_posts: {
        Row: {
          id: string
          created_by: string
          media_url: string
          media_type: string
          caption: string | null
          created_at: string
          media_width: number | null
          media_height: number | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          created_by: string
          media_url: string
          media_type?: string
          caption?: string | null
          created_at?: string
          media_width?: number | null
          media_height?: number | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          created_by?: string
          media_url?: string
          media_type?: string
          caption?: string | null
          created_at?: string
          media_width?: number | null
          media_height?: number | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      official_post_comments: {
        Row: {
          id: string
          post_id: string
          user_id: string
          body: string
          created_at: string
          parent_comment_id: string | null
          edited_at: string | null
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          body: string
          created_at?: string
          parent_comment_id?: string | null
          edited_at?: string | null
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
          body?: string
          created_at?: string
          parent_comment_id?: string | null
          edited_at?: string | null
        }
        Relationships: []
      }
      official_post_likes: {
        Row: {
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          post_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      official_post_shares: {
        Row: {
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          post_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          name: string | null
          email: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
          cover_url: string | null
          is_public: boolean
          discoverable_nearby: boolean
          location_sharing: boolean
          last_name_changed_at: string | null
          bio: string | null
          push_token: string | null
          username: string | null
          is_admin: boolean
          onboarding_completed: boolean
        }
        Insert: {
          id: string
          name?: string | null
          email?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          cover_url?: string | null
          is_public?: boolean
          discoverable_nearby?: boolean
          location_sharing?: boolean
          last_name_changed_at?: string | null
          bio?: string | null
          push_token?: string | null
          username?: string | null
          is_admin?: boolean
          onboarding_completed?: boolean
        }
        Update: {
          id?: string
          name?: string | null
          email?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          cover_url?: string | null
          is_public?: boolean
          discoverable_nearby?: boolean
          location_sharing?: boolean
          last_name_changed_at?: string | null
          bio?: string | null
          push_token?: string | null
          username?: string | null
          is_admin?: boolean
          onboarding_completed?: boolean
        }
        Relationships: []
      }
      profile_locations: {
        Row: {
          user_id: string
          latitude: number
          longitude: number
          updated_at: string
        }
        Insert: {
          user_id: string
          latitude: number
          longitude: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          latitude?: number
          longitude?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          id: number
          user_id: string
          expo_push_token: string
          platform: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          expo_push_token: string
          platform?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          expo_push_token?: string
          platform?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          id: number
          user_id: string
          media_url: string
          media_type: string
          audio_url: string | null
          audio_name: string | null
          caption: string | null
          visibility: string
          created_at: string
          expires_at: string
          music_track_id: string | null
          music_title: string | null
          music_source: string | null
          music_license_url: string | null
          privacy: string
        }
        Insert: {
          id?: number
          user_id: string
          media_url: string
          media_type?: string
          audio_url?: string | null
          audio_name?: string | null
          caption?: string | null
          visibility?: string
          created_at?: string
          expires_at?: string
          music_track_id?: string | null
          music_title?: string | null
          music_source?: string | null
          music_license_url?: string | null
          privacy?: string
        }
        Update: {
          id?: number
          user_id?: string
          media_url?: string
          media_type?: string
          audio_url?: string | null
          audio_name?: string | null
          caption?: string | null
          visibility?: string
          created_at?: string
          expires_at?: string
          music_track_id?: string | null
          music_title?: string | null
          music_source?: string | null
          music_license_url?: string | null
          privacy?: string
        }
        Relationships: []
      }
      story_reactions: {
        Row: {
          id: string
          story_id: number
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          story_id: number
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          story_id?: number
          user_id?: string
          emoji?: string
          created_at?: string
        }
        Relationships: []
      }
      story_views: {
        Row: {
          id: string
          story_id: number
          viewer_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          story_id: number
          viewer_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          story_id?: number
          viewer_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      user_push_devices: {
        Row: {
          id: string
          user_id: string
          expo_push_token: string
          platform: string
          enabled: boolean
          created_at: string
          updated_at: string
          last_notified_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          expo_push_token: string
          platform: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
          last_notified_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          expo_push_token?: string
          platform?: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
          last_notified_at?: string | null
        }
        Relationships: []
      }
      venues: {
        Row: {
          id: number
          name: string
          address: string | null
          city: string | null
          latitude: number | null
          longitude: number | null
          created_at: string
          country: string | null
          source: string | null
          source_id: string | null
          updated_at: string
          admin_rank: number | null
          admin_photo_url: string | null
          description: string | null
          geo_point: unknown
        }
        Insert: {
          id?: number
          name: string
          address?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
          country?: string | null
          source?: string | null
          source_id?: string | null
          updated_at?: string
          admin_rank?: number | null
          admin_photo_url?: string | null
          description?: string | null
          geo_point?: unknown
        }
        Update: {
          id?: number
          name?: string
          address?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
          country?: string | null
          source?: string | null
          source_id?: string | null
          updated_at?: string
          admin_rank?: number | null
          admin_photo_url?: string | null
          description?: string | null
          geo_point?: unknown
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          id: string
          name: string | null
          username: string | null
          avatar_url: string | null
          cover_url: string | null
          bio: string | null
          is_public: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_map_activity: {
        Args: Record<string, never>
        Returns: Json
      }
      start_my_checkin: {
        Args: { p_venue_id?: number; p_latitude?: number; p_longitude?: number; p_note?: string; p_visibility?: string; p_excluded_user_ids?: string[]; p_allowed_user_ids?: string[] }
        Returns: Json
      }
      deactivate_my_checkin: {
        Args: { p_checkin_id: number }
        Returns: undefined
      }
      get_visible_profiles: {
        Args: { p_ids: string[] }
        Returns: { id: string; name: string | null; username?: string | null; avatar_url?: string | null }[]
      }
      find_nearby_profiles: {
        Args: { p_lat: number; p_lng: number; p_radius_km: number }
        Returns: Json
      }
      search_public_profiles: {
        Args: { p_query: string }
        Returns: Json
      }
      purge_expired_stories: {
        Args: Record<string, never>
        Returns: undefined
      }
      get_official_post_authors: {
        Args: { p_post_ids: string[] }
        Returns: Json
      }
      admin_soft_delete_official_post: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      can_view_checkin: {
        Args: { p_checkin_user: string; p_viewer: string; p_visibility: string; p_excluded: string[]; p_allowed: string[] }
        Returns: boolean
      }
      claim_notification_action_token: {
        Args: { p_token_hash: string; p_action_type: string; p_lease_seconds?: number }
        Returns: { id: string; user_id: string; activity_id: string | null; friendship_id_bigint: number | null; sender_id: string | null; recipient_id: string | null; action_type: string | null; lease_id: string }[]
      }
    }
    Enums: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"]

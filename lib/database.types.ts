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
      push_tokens: {
        Row: {
          id: number
          user_id: string
          expo_push_token: string
          platform: string | null
          created_at: string
          updated_at: string
          fcm_token: string | null
        }
        Insert: {
          id?: number
          user_id: string
          expo_push_token: string
          platform?: string | null
          created_at?: string
          updated_at?: string
          fcm_token?: string | null
        }
        Update: {
          id?: number
          user_id?: string
          expo_push_token?: string
          platform?: string | null
          created_at?: string
          updated_at?: string
          fcm_token?: string | null
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
      get_map_activity: { Args: Record<string, never>; Returns: Json }
      start_my_checkin: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_visibility?: string
          p_excluded_user_ids?: string[]
          p_allowed_user_ids?: string[]
        }
        Returns: Json
      }
      deactivate_my_checkin: { Args: { p_checkin_id: number }; Returns: undefined }
      get_visible_profiles: {
        Args: { p_ids: string[] }
        Returns: { id: string; name: string | null; username?: string | null; avatar_url?: string | null }[]
      }
      find_nearby_profiles: {
        Args: { p_lat: number; p_lng: number; p_radius_km: number }
        Returns: Json
      }
      search_public_profiles: { Args: { p_query: string }; Returns: Json }
      purge_expired_stories: { Args: Record<string, never>; Returns: undefined }
      get_official_post_authors: { Args: { p_post_ids: string[] }; Returns: Json }
      get_official_post_comments_for_viewer: { Args: { p_post_id: string }; Returns: Json }
      admin_soft_delete_official_post: { Args: { p_post_id: string }; Returns: Json }
      claim_notification_action_token: { Args: { p_token_hash: string; p_lease_id: string }; Returns: Json }
    }
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]

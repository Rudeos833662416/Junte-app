import { ScreenContainer } from "@/components/screen-container";
import { SecureMediaViewer } from "@/components/secure-media-viewer";
import { OfficialVideo } from "@/components/official-video";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import {
  type OfficialAuthor,
  type OfficialPost,
  type CommentRow,
  formatDate,
} from "@/lib/events-shared";
import { publishOfficialPost } from "@/lib/events-admin";
import { reportError } from "@/lib/report";
import { supabase } from "@/lib/supabase";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  Modal,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
  LayoutAnimation,
  Platform,
  UIManager,
  KeyboardAvoidingView,
  Keyboard,
  type ViewToken,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const CARD_W = 268;
const CARD_GAP = 12;

function canEditComment(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

type FeaturedVenue = {
  id: number;
  name: string;
  address: string | null;
  description: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  admin_rank: number | null;
  admin_photo_url: string | null;
};

export function EventsScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const [posts, setPosts] = useState<OfficialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [editingComment, setEditingComment] = useState<CommentRow | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [fullVideo, setFullVideo] = useState<string | null>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [fullVenueImage, setFullVenueImage] = useState<string | null>(null);
  const [venueProfile, setVenueProfile] = useState<FeaturedVenue | null>(null);
  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(new Set());
  const [screenFocused, setScreenFocused] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const deletedPostIdsRef = useRef(new Set<string>());
  const [featuredVenues, setFeaturedVenues] = useState<FeaturedVenue[]>([]);
  const featuredVenuesLoop = featuredVenues.length > 1
    ? [...featuredVenues, ...featuredVenues, ...featuredVenues]
    : featuredVenues;
  const venueCarouselRef = useRef<ScrollView>(null);
  const venueCarouselIndex = useRef(0);
  const commentsListRef = useRef<FlatList<CommentRow>>(null);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => {
        setScreenFocused(false);
        setFullVideo(null);
        setFullImage(null);
        setFullVenueImage(null);
        setVenueProfile(null);
      };
    }, []),
  );

  // NOTE: truncated for size - RESTORE FROM COMMIT 3fd3f7d required
  return (
    <ScreenContainer>
      <Text style={{ color: colors.foreground, padding: 24 }}>
        Eventos: actualiza la app tras restaurar el archivo completo en GitHub.
      </Text>
    </ScreenContainer>
  );
}

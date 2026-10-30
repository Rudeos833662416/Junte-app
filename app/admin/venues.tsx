import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import {
  createVenueAdmin,
  deleteVenueAdmin,
  updateVenueAdmin,
  uploadVenuePhoto,
} from "@/lib/events-admin";
import { reportError } from "@/lib/report";
import { rankColors, type Venue } from "@/lib/events-shared";
import { AddressAutocomplete } from "@/components/address-autocomplete";

type FormState = {
  name: string;
  description: string;
  address: string;
  city: string;
  website: string;
  rank: string;
  latitude: string;
  longitude: string;
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  address: "",
  city: "",
  website: "",
  rank: "",
  latitude: "",
  longitude: "",
});

export type LayoutType = 'block' | 'separate_male' | 'separate_female' | 'unisex';
export type PriceType = 'free' | 'paid' | 'conditional_free';

export interface WorkingHour {
  day: number;
  open: string | null;
  close: string | null;
  break_start?: string | null;
  break_end?: string | null;
  is_closed?: boolean;
}

export interface Tag {
  id: number;
  slug: string;
  name: string;
  icon?: string;
}

export interface Photo {
  remote: string;
  url: string;
  thumb: string;
}

export interface Comment {
  id: number;
  location_id: number;
  user_device_id?: string;
  comment_text: string;
  status?: string;
  is_verified?: boolean;
  author_name?: string;
  author_emoji?: string;
  created_at?: string;
}

export interface Location {
  id: number;
  title: string;
  description?: string | null;
  address?: string;
  latitude: number;
  longitude: number;
  layout_type: LayoutType;
  price_type: PriceType;
  price_value?: number | null;
  condition_text?: string | null;
  is_accessible: boolean;
  is_verified: boolean;
  cabins_count?: number;
  urinals_count?: number;
  sinks_count?: number;
  rating_overall?: number;
  rating_cleanliness_avg?: number;
  rating_equipment_avg?: number;
  rating_loyalty_avg?: number;
  reviews_count?: number;
  tags: Tag[];
  photos: Photo[];
  working_hours: WorkingHour[];
  comments: Comment[];
}

export interface FilterState {
  openNow: boolean;
  layoutTypes: Set<LayoutType>;
  priceTypes: Set<PriceType>;
  accessibleOnly: boolean;
  tagSlugs: Set<string>;
  minRating: number;
  query: string;
}

export interface InstagramLocation {
  id: string;
  name: string;
  slug: string;
  hasPublicPage: boolean;
  address: {
    street_address: string;
    zip_code: string;
    city_name: string;
    region_name: string;
    country_code: string;
  } | null;
}

export interface ScrapedPost {
  shortcode: string;
  typename: string;
  caption: string | null;
  imageUrls: string[];
  location: InstagramLocation | null;
}

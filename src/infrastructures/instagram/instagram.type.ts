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

export interface InstagramOwner {
  id: string;
  username: string;
  fullName: string;
}

export interface ScrapedPost {
  owner: InstagramOwner;
  shortcode: string;
  typename: string;
  caption: string | null;
  imageUrls: string[];
  location: InstagramLocation | null;
}

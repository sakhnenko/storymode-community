// Shared background images used by the Dashboard and Project dashboard.
// Add a new entry here once and it appears in both places.
// Files ship with the app in public/backgrounds (resized to 2400px, JPEG q80),
// so every deployment, hosted or self-hosted, serves its own copies.
export interface BackgroundImage {
  url: string;
  artist: string;
  title: string;
  year: string;
}

const BUCKET = "/backgrounds/";

export const BACKGROUND_IMAGES: BackgroundImage[] = [
  {
    url: BUCKET + "whistler-nocturne-chelsea.jpg",
    artist: "James McNeill Whistler",
    title: "Nocturne: Blue and Silver — Chelsea",
    year: "1871",
  },
  {
    url: BUCKET + "whistler-nocturne-cremorne-lights.jpg",
    artist: "James McNeill Whistler",
    title: "Nocturne: Blue and Silver — Cremorne Lights",
    year: "1872",
  },
  {
    url: BUCKET + "whistler-nocturne-southampton-water.jpg",
    artist: "James McNeill Whistler",
    title: "Nocturne: Blue and Gold — Southampton Water",
    year: "1872",
  },
  {
    url: BUCKET + "friedrich-morning-mist.jpg",
    artist: "Caspar David Friedrich",
    title: "Morning Mist in the Mountains",
    year: "1808",
  },
  {
    url: BUCKET + "inness-home-of-the-heron.jpg",
    artist: "George Inness",
    title: "The Home of the Heron",
    year: "1893",
  },
  {
    url: BUCKET + "ruskin-cascade-de-la-folie.jpg",
    artist: "John Ruskin",
    title: "Cascade de la Folie, Chamonix",
    year: "1849",
  },
  {
    url: BUCKET + "towne-grasmere-rydal-road.jpg",
    artist: "Francis Towne",
    title: "Grasmere from the Rydal Road",
    year: "1786",
  },
  {
    url: BUCKET + "baker-great-barrier-island.jpg",
    artist: "William George Baker",
    title: "Great Barrier Island, New Zealand",
    year: "c. 1900",
  },
  {
    url: BUCKET + "schouman-explosion-gunboat.jpg",
    artist: "Martinus Schouman",
    title: "The Explosion of Gunboat No. 2 under Jan van Speijk",
    year: "1831",
  },
  {
    url: BUCKET + "currier-ives-fairy-grotto.jpg",
    artist: "Currier & Ives",
    title: "The Fairy Grotto",
    year: "1867",
  },
  {
    url: BUCKET + "varley-the-curfew.jpg",
    artist: "John Varley",
    title: "The Curfew",
    year: "c. 1830",
  },
];

export function pickRandomBackground(): BackgroundImage {
  return BACKGROUND_IMAGES[Math.floor(Math.random() * BACKGROUND_IMAGES.length)];
}

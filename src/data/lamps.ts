export interface LampImage {
  src: string
  alt: string
  caption: string
}

export interface Lamp {
  id: string
  /** Full display name, lowercase. */
  name: string
  number: string
  /** One playful line for the card and page subtitle. */
  tagline: string
  /** Card + page hero image. */
  hero: LampImage
  /** The longer story, one paragraph per entry. */
  story: string[]
  chips: string[]
  /** Additional shots below the story. */
  gallery: LampImage[]
  /** The build reel, embedded from instagram. */
  video: { embed: string; caption: string }
  instagram: { href: string; label: string }
}

export const LAMPS: Lamp[] = [
  {
    id: 'bubblegum',
    name: 'bubblegum',
    number: 'lamp no. 002',
    tagline: 'sixteen ikea globes, zip ties, and gravity.',
    hero: {
      src: '/work/bubblegum/hero.jpg',
      alt: 'The Bubblegum lamp glowing bright orange, hanging from a red cable between attic skylights',
      caption: 'glowing under the skylights',
    },
    story: [
      'it started in the ikea lighting aisle: sixteen globes (Ø 150 mm each), a red textile cable, and a suspicion that they could hold on to each other without any frame at all.',
      'they can. cable and zip ties pull the cluster tight, gravity does the rest — Ø 570 mm of glass with nothing inside but light. no frame, no glue, no regrets.',
      'the build got filmed, the internet got involved, and roughly 900k strangers watched a lamp being born out of a shopping bag. the lamp remains humble.',
    ],
    chips: ['16 ikea globes', 'zip ties', 'gravity', 'Ø 570 mm'],
    gallery: [
      {
        src: '/work/bubblegum/off.jpg',
        alt: 'The Bubblegum lamp switched off, a cluster of dusty-rose glass globes',
        caption: 'lights off — suddenly dusty rose',
      },
      {
        src: '/work/bubblegum/stairwell.jpg',
        alt: 'The Bubblegum lamp glowing warm orange in a white stairwell full of plants',
        caption: 'at home in the stairwell',
      },
      {
        src: '/work/bubblegum/render.jpg',
        alt: 'CAD render of the Bubblegum lamp — soft coral globes on a black cable',
        caption: 'how it was planned (the render was politer)',
      },
    ],
    video: {
      embed: 'https://www.instagram.com/reel/DbT66JqtxZv/embed/',
      caption: 'the build — as ≈900k strangers saw it',
    },
    instagram: {
      href: 'https://www.instagram.com/sankt_lampriel/p/DbfOHEAiDwH/',
      label: 'see it on instagram',
    },
  },
  {
    id: 'sr01',
    name: 'sr01 · steel reflector one',
    number: 'lamp no. 001',
    tagline: 'a steel panel, floating on light.',
    hero: {
      src: '/work/sr01/hero.jpg',
      alt: 'SR01 on the wall — a raw steel panel floating over a plywood body, warm light spilling from behind',
      caption: 'on the wall, doing its thing',
    },
    story: [
      'the first lamp. a raw steel panel floats over a birch plywood body on the wall, held apart by just enough distance for light to escape.',
      "the bulb sits hidden in the gap — you never see it, only the glow it leaves behind. light shouldn't always come from a bulb you can see.",
      'built from scratch, filmed on a shaky tripod, and still lamp no. 001 — the one that started the whole thing.',
    ],
    chips: ['raw steel', 'birch plywood', 'invisible bulb', 'wall-mounted'],
    gallery: [
      {
        src: '/work/sr01/detail.jpg',
        alt: 'Close-up of SR01 — the plywood edge and steel panel with light glowing in the gap between them',
        caption: 'the gap where the light lives',
      },
      {
        src: '/work/sr01/workbench.jpg',
        alt: 'SR01 lying on the workbench, a thin line of light glowing along its edge',
        caption: 'first light, still on the workbench',
      },
    ],
    video: {
      embed: 'https://www.instagram.com/reel/DbLjrfNIQBP/embed/',
      caption: 'the build reel — shaky tripod included',
    },
    instagram: {
      href: 'https://www.instagram.com/sankt_lampriel/p/DbL6S_BiJwN/',
      label: 'see it on instagram',
    },
  },
]

export const lampById = (id: string) => LAMPS.find((lamp) => lamp.id === id)

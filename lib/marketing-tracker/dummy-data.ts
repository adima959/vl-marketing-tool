import type {
  TrackerUser,
  Product,
  Angle,
  Message,
  Creative,
  Asset,
  ProductWithStats,
} from '@/types';

// Dummy Users
export const DUMMY_USERS: TrackerUser[] = [
  {
    id: 'user-1',
    name: 'Sarah Johnson',
    email: 'sarah@vitaliv.com',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'user-2',
    name: 'Michael Chen',
    email: 'michael@vitaliv.com',
    createdAt: '2024-02-01T10:00:00Z',
    updatedAt: '2024-02-01T10:00:00Z',
  },
];

// Dummy Products - Based on real Vitaliv product
export const DUMMY_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Flex Repair',
    description:
      '<p>Natural joint support supplement with turmeric, ginger, Boswellia Serrata, and vitamins. Helps maintain the health of joints and bones, and supports joint flexibility.</p>',
    notes: 'Subscription model with 40% first month discount. Price: 269.4 SEK/month.',
    ownerId: 'user-1',
    owner: DUMMY_USERS[0],
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-06-15T14:30:00Z',
  },
];

// Dummy Angles - Problem area folders
export const DUMMY_ANGLES: Angle[] = [
  // Flex Repair angles
  {
    id: 'angle-1',
    productId: 'prod-1',
    name: 'Joint Pain & Daily Life',
    description: 'Joint pain interfering with everyday activities and family moments',
    status: 'live',
    launchedAt: '2024-04-01T10:00:00Z',
    createdAt: '2024-02-15T10:00:00Z',
    updatedAt: '2024-06-10T14:00:00Z',
    messageCount: 3,
  },
  {
    id: 'angle-2',
    productId: 'prod-1',
    name: 'Active Lifestyle',
    description: 'Joint issues preventing sports, hobbies, and active pursuits',
    status: 'idea',
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-06-12T11:00:00Z',
    messageCount: 2,
  },
  {
    id: 'angle-3',
    productId: 'prod-1',
    name: 'Natural Alternative to Medication',
    description: 'Positioning against prescription pain medication and dependency',
    status: 'idea',
    createdAt: '2024-06-01T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    messageCount: 1,
  },
];

// Dummy Messages - Hypothesis level
export const DUMMY_MESSAGES: Message[] = [
  // Joint Pain & Daily Life messages
  {
    id: 'msg-1',
    angleId: 'angle-1',
    name: "Can't play with grandkids",
    description:
      '<p>Emotional connection to playing with grandchildren without joint pain. Targets the fear of missing precious family moments.</p>',
    specificPainPoint: "I can't keep up with my grandchildren anymore",
    corePromise: 'Move freely and be present for precious family moments',
    keyIdea: 'Joint pain steals irreplaceable time with the people you love most',
    primaryHookDirection: 'Emotional grandparent scenes - before/after transformation',
    headlines: [
      'Keep up with your grandchildren again',
      "Don't let stiff joints steal these moments",
      "They grow up fast. Don't miss it.",
    ],
    status: 'live',
    launchedAt: '2024-04-05T10:00:00Z',
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-05-20T14:00:00Z',
    assetCount: 3,
    creativeCount: 2,
  },
  {
    id: 'msg-2',
    angleId: 'angle-1',
    name: "Can't sleep due to joint pain",
    description:
      '<p>Targets people whose sleep is disrupted by joint pain. Focus on the connection between rest and recovery.</p>',
    specificPainPoint: 'I toss and turn all night because of joint pain',
    corePromise: 'Wake up refreshed, not in pain',
    keyIdea: 'Night pain is different - your body heals during sleep, but pain prevents that healing',
    primaryHookDirection: 'Relatable night pain scenes, morning relief transformation',
    headlines: ['Finally sleep through the night', 'Stop dreading bedtime', 'Morning stiffness starts at night'],
    status: 'in_production',
    createdAt: '2024-05-10T10:00:00Z',
    updatedAt: '2024-06-08T10:00:00Z',
    assetCount: 0,
    creativeCount: 0,
  },
  {
    id: 'msg-3',
    angleId: 'angle-1',
    name: 'Getting in/out of car is painful',
    description:
      '<p>Simple daily movements that have become obstacles. Loss of independence angle.</p>',
    specificPainPoint: 'Simple movements like getting out of my car have become a struggle',
    corePromise: 'Move like you used to - naturally and without thinking',
    keyIdea: "When small movements become obstacles, you've lost more than mobility - you've lost freedom",
    primaryHookDirection: 'Daily micro-moments of struggle → freedom',
    headlines: ['Remember when getting up was easy?', "Your car shouldn't feel like a trap"],
    status: 'idea',
    createdAt: '2024-06-01T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    assetCount: 0,
    creativeCount: 0,
  },
  // Active Lifestyle messages
  {
    id: 'msg-4',
    angleId: 'angle-2',
    name: 'Back to golf',
    description: '<p>Targets golf enthusiasts who had to give up the sport due to joint pain.</p>',
    specificPainPoint: 'I had to give up golf because of my joints',
    corePromise: 'Play 18 holes without paying for it tomorrow',
    keyIdea: "Golf isn't just a sport - it's your identity, your friends, your weekends",
    primaryHookDirection: 'Golf-specific lifestyle, course footage, social connection',
    headlines: ['Get back on the course', 'Your golf buddies miss you', "Don't let your clubs collect dust"],
    status: 'idea',
    createdAt: '2024-05-15T10:00:00Z',
    updatedAt: '2024-06-10T10:00:00Z',
    assetCount: 0,
    creativeCount: 0,
  },
  {
    id: 'msg-5',
    angleId: 'angle-2',
    name: 'Skiing/active winter sports',
    description: '<p>Seasonal angle for winter sports enthusiasts. Urgency around ski season.</p>',
    specificPainPoint: "My knees can't handle the slopes anymore",
    corePromise: 'Hit the slopes all season',
    keyIdea: "Don't let joint pain put your skis in storage",
    primaryHookDirection: 'Seasonal urgency, mountain lifestyle, freedom of movement',
    headlines: ['This could be your best ski season yet', "Don't watch from the lodge", 'Your knees deserve a comeback'],
    status: 'idea',
    createdAt: '2024-06-01T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    assetCount: 0,
    creativeCount: 0,
  },
  // Natural Alternative messages
  {
    id: 'msg-6',
    angleId: 'angle-3',
    name: 'Tired of pills',
    description:
      '<p>Positions product as safe alternative to prescription painkillers. Natural ingredients angle.</p>',
    specificPainPoint: "I don't want to depend on painkillers",
    corePromise: 'Natural support your body can use',
    keyIdea: 'Turmeric and ginger have been used for centuries - now in a modern formula',
    primaryHookDirection: 'Natural ingredients, science-backed tradition, no dependency',
    headlines: [
      'What if you could support your joints naturally?',
      'Ancient wisdom, modern science',
      'Break free from the pill cycle',
    ],
    status: 'idea',
    createdAt: '2024-06-05T10:00:00Z',
    updatedAt: '2024-06-05T10:00:00Z',
    assetCount: 0,
    creativeCount: 0,
  },
];

// Dummy Creatives
export const DUMMY_CREATIVES: Creative[] = [
  // Grandkids message creatives
  {
    id: 'creative-1',
    messageId: 'msg-1',
    geo: 'NO',
    name: 'Grandparent testimonial - playing in park',
    format: 'ugc_video',
    cta: 'Learn More',
    url: 'https://drive.google.com/folder/grandparent-ugc-no',
    notes: 'Real customer testimonial, 45 seconds. Grandma playing with 2 grandchildren in park.',
    createdAt: '2024-04-05T10:00:00Z',
    updatedAt: '2024-04-05T10:00:00Z',
  },
  {
    id: 'creative-2',
    messageId: 'msg-1',
    geo: 'SE',
    name: 'Before/after lifestyle imagery',
    format: 'static_image',
    cta: 'Shop Now',
    url: 'https://drive.google.com/folder/grandparent-static-se',
    notes: 'Carousel set: 5 images showing transformation from struggle to joy with grandkids',
    createdAt: '2024-04-10T10:00:00Z',
    updatedAt: '2024-05-01T10:00:00Z',
  },
];

// Dummy Assets (non-creative materials)
export const DUMMY_ASSETS: Asset[] = [
  // Grandkids message assets
  {
    id: 'asset-1',
    messageId: 'msg-1',
    geo: 'NO',
    type: 'landing_page',
    name: 'Grandkids LP - Norway',
    url: 'https://vitaliv.no/flex-repair/grandkids',
    createdAt: '2024-03-15T10:00:00Z',
    updatedAt: '2024-05-01T10:00:00Z',
  },
  {
    id: 'asset-2',
    messageId: 'msg-1',
    geo: 'SE',
    type: 'landing_page',
    name: 'Barnbarn LP - Sweden',
    url: 'https://vitaliv.se/flex-repair/barnbarn',
    createdAt: '2024-04-01T10:00:00Z',
    updatedAt: '2024-05-10T10:00:00Z',
  },
  {
    id: 'asset-3',
    messageId: 'msg-1',
    geo: 'DK',
    type: 'text_ad',
    name: 'Facebook Primary Text - DK',
    content:
      '<p><strong>Holder du op med at lege med børnebørnene?</strong></p><p>Flex Repair med gurkemeje og ingefær hjælper dig med at bevare bevægeligheden, så du kan nyde hver eneste øjeblik med dem, du elsker.</p><p>✓ Naturlige ingredienser<br/>✓ Støtter led og knogler<br/>✓ 40% rabat første måned</p>',
    createdAt: '2024-04-10T10:00:00Z',
    updatedAt: '2024-04-10T10:00:00Z',
  },
];

// Helper functions to get data with relationships
export function getProductsWithStats(): ProductWithStats[] {
  return DUMMY_PRODUCTS.map((product) => {
    const angles = DUMMY_ANGLES.filter((a) => a.productId === product.id);
    return {
      ...product,
      angleCount: angles.length,
      activeAngleCount: angles.filter((a) => a.status === 'live').length,
    };
  });
}

export function getAnglesForProduct(productId: string): Angle[] {
  return DUMMY_ANGLES.filter((a) => a.productId === productId);
}

export function getMessagesForAngle(angleId: string): Message[] {
  return DUMMY_MESSAGES.filter((m) => m.angleId === angleId);
}

export function getAssetsForMessage(messageId: string): Asset[] {
  return DUMMY_ASSETS.filter((a) => a.messageId === messageId);
}

export function getCreativesForMessage(messageId: string): Creative[] {
  return DUMMY_CREATIVES.filter((c) => c.messageId === messageId);
}

export function getProductById(productId: string): Product | undefined {
  return DUMMY_PRODUCTS.find((p) => p.id === productId);
}

export function getAngleById(angleId: string): Angle | undefined {
  return DUMMY_ANGLES.find((a) => a.id === angleId);
}

export function getMessageById(messageId: string): Message | undefined {
  return DUMMY_MESSAGES.find((m) => m.id === messageId);
}

export function getUserById(userId: string): TrackerUser | undefined {
  return DUMMY_USERS.find((u) => u.id === userId);
}

// Legacy function aliases for backward compatibility during migration
/** @deprecated Use getAnglesForProduct instead */
export const getMainAnglesForProduct = getAnglesForProduct;
/** @deprecated Use getMessagesForAngle instead */
export const getSubAnglesForMainAngle = getMessagesForAngle;
/** @deprecated Use getAssetsForMessage instead */
export const getAssetsForSubAngle = getAssetsForMessage;
/** @deprecated Use getAngleById instead */
export const getMainAngleById = getAngleById;
/** @deprecated Use getMessageById instead */
export const getSubAngleById = getMessageById;

// Legacy data exports for backward compatibility
/** @deprecated Use DUMMY_MESSAGES instead */
export const DUMMY_SUB_ANGLES = DUMMY_MESSAGES;
/** @deprecated Use DUMMY_ANGLES instead */
export const DUMMY_MAIN_ANGLES = DUMMY_ANGLES;

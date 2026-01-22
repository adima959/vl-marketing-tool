import type {
  TrackerUser,
  Product,
  MainAngle,
  SubAngle,
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
  {
    id: 'user-3',
    name: 'Emma Nielsen',
    email: 'emma@vitaliv.com',
    createdAt: '2024-03-10T10:00:00Z',
    updatedAt: '2024-03-10T10:00:00Z',
  },
];

// Dummy Products
export const DUMMY_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'FlexiMove Advanced',
    description: '<p>Premium joint health supplement targeting active seniors and athletes. Key ingredients include glucosamine, chondroitin, and MSM.</p>',
    ownerId: 'user-1',
    owner: DUMMY_USERS[0],
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-06-15T14:30:00Z',
  },
  {
    id: 'prod-2',
    name: 'VitaBoost Pro',
    description: '<p>Comprehensive multivitamin formulation designed for busy professionals. Enhanced with B-complex and adaptogens for energy and stress support.</p>',
    ownerId: 'user-2',
    owner: DUMMY_USERS[1],
    createdAt: '2024-02-10T10:00:00Z',
    updatedAt: '2024-05-20T11:00:00Z',
  },
  {
    id: 'prod-3',
    name: 'SleepWell Natural',
    description: '<p>Natural sleep support formula with melatonin, valerian root, and magnesium. Non-habit forming.</p>',
    ownerId: 'user-3',
    owner: DUMMY_USERS[2],
    createdAt: '2024-03-15T10:00:00Z',
    updatedAt: '2024-06-01T09:00:00Z',
  },
];

// Dummy Main Angles
export const DUMMY_MAIN_ANGLES: MainAngle[] = [
  // FlexiMove Advanced angles
  {
    id: 'angle-1',
    productId: 'prod-1',
    name: 'The Active Senior',
    targetAudience: 'Adults 55+, active lifestyle, experiencing joint stiffness',
    painPoint: 'Fear of losing mobility and independence as they age',
    hook: 'Keep doing what you love, without the aches',
    description: '<p>This angle targets seniors who want to maintain their active lifestyle. Key messaging focuses on:</p><ul><li>Maintaining independence</li><li>Enjoying grandchildren</li><li>Staying active in hobbies</li></ul>',
    status: 'live',
    launchedAt: '2024-04-01T10:00:00Z',
    createdAt: '2024-02-15T10:00:00Z',
    updatedAt: '2024-06-10T14:00:00Z',
    subAngleCount: 3,
  },
  {
    id: 'angle-2',
    productId: 'prod-1',
    name: 'The Weekend Warrior',
    targetAudience: 'Adults 35-50, occasional athletes, active on weekends',
    painPoint: 'Monday morning stiffness after weekend activities',
    hook: 'Recover faster, play harder',
    description: '<p>Targeting weekend athletes who push hard on Saturday and suffer on Monday.</p>',
    status: 'in_production',
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-06-12T11:00:00Z',
    subAngleCount: 2,
  },
  {
    id: 'angle-3',
    productId: 'prod-1',
    name: 'The Professional Athlete',
    targetAudience: 'Competitive athletes, fitness enthusiasts',
    painPoint: 'Joint wear from intense training',
    hook: 'Protect your joints, extend your career',
    description: '<p>Premium positioning for serious athletes.</p>',
    status: 'idea',
    createdAt: '2024-06-01T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    subAngleCount: 0,
  },
  // VitaBoost Pro angles
  {
    id: 'angle-4',
    productId: 'prod-2',
    name: 'The Burned Out Professional',
    targetAudience: 'Office workers 30-45, high stress jobs',
    painPoint: 'Constant fatigue despite sleeping enough',
    hook: 'Energy that lasts all day',
    description: '<p>Targets professionals feeling drained. Focus on sustained energy vs caffeine crashes.</p>',
    status: 'live',
    launchedAt: '2024-03-15T10:00:00Z',
    createdAt: '2024-02-20T10:00:00Z',
    updatedAt: '2024-05-18T16:00:00Z',
    subAngleCount: 2,
  },
  {
    id: 'angle-5',
    productId: 'prod-2',
    name: 'The Health Optimizer',
    targetAudience: 'Health-conscious individuals 25-40',
    painPoint: 'Confusion about which supplements to take',
    hook: 'Everything you need in one capsule',
    description: '<p>Simplicity angle - replaces 5+ bottles with one solution.</p>',
    status: 'paused',
    launchedAt: '2024-04-01T10:00:00Z',
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-06-05T10:00:00Z',
    subAngleCount: 1,
  },
  // SleepWell Natural angles
  {
    id: 'angle-6',
    productId: 'prod-3',
    name: 'The Anxious Sleeper',
    targetAudience: 'Adults 25-55 with racing thoughts at night',
    painPoint: 'Mind won\'t shut off at bedtime',
    hook: 'Quiet your mind, find your rest',
    description: '<p>Targets people whose sleep issues stem from anxiety and overthinking.</p>',
    status: 'live',
    launchedAt: '2024-04-20T10:00:00Z',
    createdAt: '2024-03-25T10:00:00Z',
    updatedAt: '2024-05-30T12:00:00Z',
    subAngleCount: 2,
  },
  {
    id: 'angle-7',
    productId: 'prod-3',
    name: 'The Natural Alternative',
    targetAudience: 'Adults avoiding prescription sleep aids',
    painPoint: 'Fear of dependency on sleep medication',
    hook: 'Sleep naturally, wake refreshed',
    description: '<p>Positions product as safe alternative to prescription options.</p>',
    status: 'retired',
    launchedAt: '2024-03-01T10:00:00Z',
    createdAt: '2024-02-15T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    subAngleCount: 1,
  },
];

// Dummy Sub-Angles
export const DUMMY_SUB_ANGLES: SubAngle[] = [
  // Active Senior sub-angles
  {
    id: 'sub-1',
    mainAngleId: 'angle-1',
    name: 'The Grandparent Angle',
    hook: 'Keep up with your grandchildren',
    description: '<p>Emotional connection to playing with grandkids without joint pain.</p>',
    status: 'live',
    launchedAt: '2024-04-05T10:00:00Z',
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-05-20T14:00:00Z',
    assetCount: 4,
  },
  {
    id: 'sub-2',
    mainAngleId: 'angle-1',
    name: 'The Golf Angle',
    hook: 'Play 18 holes without the pain',
    description: '<p>Targets golf enthusiasts specifically.</p>',
    status: 'live',
    launchedAt: '2024-04-10T10:00:00Z',
    createdAt: '2024-03-10T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    assetCount: 3,
  },
  {
    id: 'sub-3',
    mainAngleId: 'angle-1',
    name: 'The Gardening Angle',
    hook: 'Get back to your garden',
    description: '<p>Targets gardening enthusiasts who struggle with knee and back pain.</p>',
    status: 'in_production',
    createdAt: '2024-05-15T10:00:00Z',
    updatedAt: '2024-06-10T10:00:00Z',
    assetCount: 1,
  },
  // Weekend Warrior sub-angles
  {
    id: 'sub-4',
    mainAngleId: 'angle-2',
    name: 'The Runner',
    hook: 'Run on Sunday, walk on Monday',
    description: '<p>For recreational runners dealing with knee issues.</p>',
    status: 'in_production',
    createdAt: '2024-05-10T10:00:00Z',
    updatedAt: '2024-06-08T10:00:00Z',
    assetCount: 2,
  },
  {
    id: 'sub-5',
    mainAngleId: 'angle-2',
    name: 'The Ski Enthusiast',
    hook: 'Hit the slopes all season',
    description: '<p>Seasonal angle for winter sports enthusiasts.</p>',
    status: 'idea',
    createdAt: '2024-06-01T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    assetCount: 0,
  },
  // Burned Out Professional sub-angles
  {
    id: 'sub-6',
    mainAngleId: 'angle-4',
    name: 'The 3PM Crash',
    hook: 'Beat the afternoon slump naturally',
    description: '<p>Targets the specific moment when energy dips.</p>',
    status: 'live',
    launchedAt: '2024-03-20T10:00:00Z',
    createdAt: '2024-03-01T10:00:00Z',
    updatedAt: '2024-05-15T10:00:00Z',
    assetCount: 5,
  },
  {
    id: 'sub-7',
    mainAngleId: 'angle-4',
    name: 'The Coffee Replacement',
    hook: 'Better than your 4th cup',
    description: '<p>Positions as healthier alternative to excessive coffee.</p>',
    status: 'live',
    launchedAt: '2024-04-01T10:00:00Z',
    createdAt: '2024-03-15T10:00:00Z',
    updatedAt: '2024-05-10T10:00:00Z',
    assetCount: 3,
  },
  // Health Optimizer sub-angle
  {
    id: 'sub-8',
    mainAngleId: 'angle-5',
    name: 'The Minimalist',
    hook: 'Simplify your supplement routine',
    description: '<p>For people overwhelmed by supplement complexity.</p>',
    status: 'paused',
    launchedAt: '2024-04-05T10:00:00Z',
    createdAt: '2024-03-20T10:00:00Z',
    updatedAt: '2024-06-05T10:00:00Z',
    assetCount: 2,
  },
  // Anxious Sleeper sub-angles
  {
    id: 'sub-9',
    mainAngleId: 'angle-6',
    name: 'The Work Stress',
    hook: 'Leave work worries at the door',
    description: '<p>For professionals who can\'t stop thinking about work.</p>',
    status: 'live',
    launchedAt: '2024-04-25T10:00:00Z',
    createdAt: '2024-04-01T10:00:00Z',
    updatedAt: '2024-05-28T10:00:00Z',
    assetCount: 4,
  },
  {
    id: 'sub-10',
    mainAngleId: 'angle-6',
    name: 'The New Parent',
    hook: 'Rest when you can',
    description: '<p>For new parents who need quality sleep when they get the chance.</p>',
    status: 'in_production',
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    assetCount: 1,
  },
  // Natural Alternative sub-angle
  {
    id: 'sub-11',
    mainAngleId: 'angle-7',
    name: 'The Melatonin Story',
    hook: 'Work with your body\'s natural rhythm',
    description: '<p>Educational angle about natural sleep hormones.</p>',
    status: 'retired',
    launchedAt: '2024-03-05T10:00:00Z',
    createdAt: '2024-02-20T10:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
    assetCount: 2,
  },
];

// Dummy Assets
export const DUMMY_ASSETS: Asset[] = [
  // Grandparent Angle assets
  {
    id: 'asset-1',
    subAngleId: 'sub-1',
    geo: 'NO',
    type: 'landing_page',
    name: 'Grandparent LP - Norway',
    url: 'https://vitaliv.no/fleximove/grandparent',
    createdAt: '2024-03-15T10:00:00Z',
    updatedAt: '2024-05-01T10:00:00Z',
  },
  {
    id: 'asset-2',
    subAngleId: 'sub-1',
    geo: 'NO',
    type: 'image_ads',
    name: 'Grandparent Creative Pack - NO',
    url: 'https://drive.google.com/folder/grandparent-no',
    notes: 'Includes 5 static images and 2 carousel sets',
    createdAt: '2024-03-20T10:00:00Z',
    updatedAt: '2024-04-15T10:00:00Z',
  },
  {
    id: 'asset-3',
    subAngleId: 'sub-1',
    geo: 'SE',
    type: 'landing_page',
    name: 'Grandparent LP - Sweden',
    url: 'https://vitaliv.se/fleximove/grandparent',
    createdAt: '2024-04-01T10:00:00Z',
    updatedAt: '2024-05-10T10:00:00Z',
  },
  {
    id: 'asset-4',
    subAngleId: 'sub-1',
    geo: 'DK',
    type: 'text_ad',
    name: 'Facebook Primary Text - DK',
    content: '<p><strong>Holder du op med at lege med børnebørnene?</strong></p><p>FlexiMove Advanced hjælper dig med at bevare bevægeligheden, så du kan nyde hver eneste øjeblik med dem, du elsker.</p>',
    createdAt: '2024-04-10T10:00:00Z',
    updatedAt: '2024-04-10T10:00:00Z',
  },
  // Golf Angle assets
  {
    id: 'asset-5',
    subAngleId: 'sub-2',
    geo: 'NO',
    type: 'ugc_video',
    name: 'Golf Testimonial - Hans',
    url: 'https://drive.google.com/video/golf-hans',
    notes: 'Real customer testimonial, 45 seconds',
    createdAt: '2024-04-05T10:00:00Z',
    updatedAt: '2024-04-05T10:00:00Z',
  },
  {
    id: 'asset-6',
    subAngleId: 'sub-2',
    geo: 'SE',
    type: 'landing_page',
    name: 'Golf LP - Sweden',
    url: 'https://vitaliv.se/fleximove/golf',
    createdAt: '2024-04-15T10:00:00Z',
    updatedAt: '2024-05-20T10:00:00Z',
  },
  {
    id: 'asset-7',
    subAngleId: 'sub-2',
    geo: 'NO',
    type: 'brief',
    name: 'Golf Creative Brief',
    content: '<p><strong>Creative Brief: Golf Angle</strong></p><ul><li>Target: Male golfers 55+</li><li>Tone: Aspirational but relatable</li><li>Key visual: Person completing swing without grimacing</li></ul>',
    createdAt: '2024-03-25T10:00:00Z',
    updatedAt: '2024-03-25T10:00:00Z',
  },
  // 3PM Crash assets
  {
    id: 'asset-8',
    subAngleId: 'sub-6',
    geo: 'NO',
    type: 'landing_page',
    name: '3PM Crash LP - Norway',
    url: 'https://vitaliv.no/vitaboost/afternoon-energy',
    createdAt: '2024-03-10T10:00:00Z',
    updatedAt: '2024-05-01T10:00:00Z',
  },
  {
    id: 'asset-9',
    subAngleId: 'sub-6',
    geo: 'NO',
    type: 'image_ads',
    name: 'Office Energy Creative Pack',
    url: 'https://drive.google.com/folder/office-energy-no',
    createdAt: '2024-03-15T10:00:00Z',
    updatedAt: '2024-04-20T10:00:00Z',
  },
  {
    id: 'asset-10',
    subAngleId: 'sub-6',
    geo: 'SE',
    type: 'landing_page',
    name: '3PM Crash LP - Sweden',
    url: 'https://vitaliv.se/vitaboost/afternoon-energy',
    createdAt: '2024-03-20T10:00:00Z',
    updatedAt: '2024-05-05T10:00:00Z',
  },
  {
    id: 'asset-11',
    subAngleId: 'sub-6',
    geo: 'DK',
    type: 'landing_page',
    name: '3PM Crash LP - Denmark',
    url: 'https://vitaliv.dk/vitaboost/afternoon-energy',
    createdAt: '2024-03-25T10:00:00Z',
    updatedAt: '2024-05-10T10:00:00Z',
  },
  {
    id: 'asset-12',
    subAngleId: 'sub-6',
    geo: 'NO',
    type: 'research',
    name: 'Afternoon Energy Research Notes',
    content: '<p><strong>Key Findings:</strong></p><ul><li>78% of office workers experience afternoon energy dip</li><li>Average dip occurs between 2-4 PM</li><li>Top coping mechanisms: coffee (65%), snacks (45%), walk (20%)</li></ul><p>Source: Internal survey, March 2024</p>',
    createdAt: '2024-02-28T10:00:00Z',
    updatedAt: '2024-02-28T10:00:00Z',
  },
  // Work Stress assets
  {
    id: 'asset-13',
    subAngleId: 'sub-9',
    geo: 'NO',
    type: 'landing_page',
    name: 'Work Stress LP - Norway',
    url: 'https://vitaliv.no/sleepwell/work-stress',
    createdAt: '2024-04-10T10:00:00Z',
    updatedAt: '2024-05-25T10:00:00Z',
  },
  {
    id: 'asset-14',
    subAngleId: 'sub-9',
    geo: 'NO',
    type: 'ugc_video',
    name: 'Work Stress Testimonial - Maria',
    url: 'https://drive.google.com/video/work-stress-maria',
    notes: 'Professional woman testimonial, 60 seconds',
    createdAt: '2024-04-20T10:00:00Z',
    updatedAt: '2024-04-20T10:00:00Z',
  },
  {
    id: 'asset-15',
    subAngleId: 'sub-9',
    geo: 'SE',
    type: 'image_ads',
    name: 'Work Stress Creative Pack - SE',
    url: 'https://drive.google.com/folder/work-stress-se',
    createdAt: '2024-04-25T10:00:00Z',
    updatedAt: '2024-05-15T10:00:00Z',
  },
  {
    id: 'asset-16',
    subAngleId: 'sub-9',
    geo: 'DK',
    type: 'text_ad',
    name: 'Facebook Primary Text - DK',
    content: '<p><strong>Kan du ikke stoppe med at tænke på arbejde?</strong></p><p>SleepWell Natural hjælper dig med at slappe af og finde den ro, du fortjener.</p>',
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-05-01T10:00:00Z',
  },
];

// Helper functions to get data with relationships
export function getProductsWithStats(): ProductWithStats[] {
  return DUMMY_PRODUCTS.map((product) => {
    const angles = DUMMY_MAIN_ANGLES.filter((a) => a.productId === product.id);
    return {
      ...product,
      angleCount: angles.length,
      activeAngleCount: angles.filter((a) => a.status === 'live').length,
    };
  });
}

export function getMainAnglesForProduct(productId: string): MainAngle[] {
  return DUMMY_MAIN_ANGLES.filter((a) => a.productId === productId);
}

export function getSubAnglesForMainAngle(mainAngleId: string): SubAngle[] {
  return DUMMY_SUB_ANGLES.filter((s) => s.mainAngleId === mainAngleId);
}

export function getAssetsForSubAngle(subAngleId: string): Asset[] {
  return DUMMY_ASSETS.filter((a) => a.subAngleId === subAngleId);
}

export function getProductById(productId: string): Product | undefined {
  return DUMMY_PRODUCTS.find((p) => p.id === productId);
}

export function getMainAngleById(angleId: string): MainAngle | undefined {
  return DUMMY_MAIN_ANGLES.find((a) => a.id === angleId);
}

export function getSubAngleById(subAngleId: string): SubAngle | undefined {
  return DUMMY_SUB_ANGLES.find((s) => s.id === subAngleId);
}

export function getUserById(userId: string): TrackerUser | undefined {
  return DUMMY_USERS.find((u) => u.id === userId);
}

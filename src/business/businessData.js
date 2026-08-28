const subcategory = label => ({
  id: label.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  label,
});

const category = (id, label, icon, subcategories) => ({ id, label, icon, subcategories: subcategories.map(subcategory) });

export const BUSINESS_CATEGORIES = [
  category('food', 'Food & Catering', '\u{1F37D}\uFE0F', ['Restaurants & Cafes', 'Home Kitchens', 'Catering', 'Niaz Preparation and supply', 'Bakeries & Desserts', 'Groceries & Specialty Foods', 'Halal Meat & Butchers', 'Food Trucks', 'Beverages', 'Meal Preparation']),
  category('events', 'Events & Celebrations', '\u{1F389}', ['Event Planning', 'Venues & Function Centres', 'Photography & Videography', 'Decorations & Styling', 'Florists', 'Sound, Lighting & AV', 'Entertainment, DJs & MCs', 'Invitations, Printing & Signage', 'Marquee, Furniture & Equipment Hire', 'Wedding Services']),
  category('retail', 'Retail & Fashion', '\u{1F6CD}\uFE0F', ['Clothing & Fashion', 'Modest Fashion & Hijab', 'Tailoring & Alterations', 'Footwear & Accessories', 'Jewellery & Watches', 'Beauty, Cosmetics & Fragrances', 'Gifts & Homewares', 'Books & Religious Goods', 'General Retail', 'Online Stores']),
  category('professional', 'Professional Services', '\u{1F4BC}', ['Accounting, Bookkeeping & Tax', 'Legal Services', 'Justice of the Peace (JP) Services', 'Finance & Mortgage Brokers', 'Insurance', 'Real Estate', 'Business Consulting', 'Marketing & Branding', 'Human Resources & Recruitment', 'Translation & Interpreting', 'Administration & Virtual Assistance']),
  category('health', 'Health & Wellness', '\u{1FA7A}', ['General Practice & Medical', 'Dental', 'Pharmacy', 'Physiotherapy & Rehabilitation', 'Psychology & Counselling', 'Optometry', 'Nutrition & Dietetics', 'Fitness & Personal Training', 'Allied Health', 'Aged, Disability & Home Care', 'Personal Care & Grooming']),
  category('education', 'Education', '\u{1F393}', ['Early Childhood & Childcare', 'Primary & Secondary Tutoring', 'Quran & Islamic Education', 'Languages', 'Vocational & Trade Training', 'University & Higher Education Support', 'Music & Arts', 'Driving Schools', 'Online Courses', 'Special Learning Support']),
  category('home', 'Home Services', '\u{1F6E0}\uFE0F', ['Cleaning', 'Gardening & Lawn Care', 'Pest Control', 'Handyman & Minor Repairs', 'Appliance Repair', 'Locksmiths & Security', 'Removalists & Storage', 'Property Maintenance', 'Pool Services', 'Home Organisation']),
  category('automotive', 'Automotive', '\u{1F697}', ['Mechanical Repairs & Servicing', 'Tyres & Wheels', 'Auto Electrical', 'Panel Beating & Paint', 'Car Wash & Detailing', 'Roadside Assistance & Towing', 'Parts & Accessories', 'Vehicle Sales', 'Vehicle Rental', 'Inspections', 'Motorcycles']),
  category('construction', 'Construction & Builders', '\u{1F3D7}\uFE0F', ['Residential Builders', 'Commercial Builders', 'Renovations & Extensions', 'Architects & Building Designers', 'Engineering & Surveying', 'Project Management', 'Carpentry & Joinery', 'Plumbing, Electrical & HVAC', 'Roofing & Gutters', 'Concreting, Bricklaying & Masonry', 'Tiling, Flooring, Painting & Plastering', 'Demolition, Excavation & Waterproofing']),
  category('technology', 'Technology', '\u{1F4BB}', ['IT Support & Managed Services', 'Software & App Development', 'Website & E-commerce Development', 'Cybersecurity', 'Cloud, Networking & Infrastructure', 'Data, AI & Automation', 'Telecommunications', 'Computers, Devices & Repairs', 'Business Systems & Point of Sale', 'CCTV, Security & Smart Home', 'Technology Consulting & Training']),
];

export const SAMPLE_BUSINESSES = [
  {
    id: 'zaiqa-home-kitchen',
    name: 'Zaiqa Home Kitchen',
    initials: 'ZK',
    categoryId: 'food',
    category: 'Food & Catering',
    tier: 'featured',
    city: 'sydney',
    suburb: 'Lakemba',
    distanceKm: 2.4,
    openNow: true,
    hoursSummary: 'Open until 9:00 PM',
    abn: '51 824 753 556',
    phone: '+61 400 111 222',
    whatsapp: '+61400111222',
    website: 'https://example.com/zaiqa-home-kitchen',
    address: '12 Wattle Street, Lakemba NSW 2195',
    description: 'Home-style biryani, karahi and catering trays for community events of any size. Sindhi and Karachi-style menus, made fresh to order.',
    coverColor: '#0d6e6e',
    secondaryColor: '#07564f',
    promotionIds: ['eid-catering-special'],
    verified: true,
  },
  {
    id: 'al-noor-photography',
    name: 'Al-Noor Photography',
    initials: 'AN',
    categoryId: 'events',
    category: 'Events & Celebrations',
    tier: 'featured',
    city: 'sydney',
    suburb: 'Punchbowl',
    distanceKm: 4.1,
    openNow: false,
    hoursSummary: 'By appointment',
    abn: '72 004 210 837',
    phone: '+61 411 222 333',
    whatsapp: '+61411222333',
    website: 'https://example.com/al-noor-photography',
    address: 'Mobile service across Sydney metro',
    description: 'Event photography and videography for majlis, weddings and community functions. Same-week highlight reels are available.',
    coverColor: '#4f9d5d',
    secondaryColor: '#2f6b3b',
    promotionIds: ['second-event-saving'],
    verified: true,
  },
  {
    id: 'sanaa-boutique',
    name: 'Sanaa Boutique',
    initials: 'SB',
    categoryId: 'retail',
    category: 'Retail & Fashion',
    tier: 'standard',
    city: 'sydney',
    suburb: 'Lakemba',
    distanceKm: 2.9,
    openNow: true,
    hoursSummary: 'Open until 6:00 PM',
    abn: '38 913 245 671',
    phone: '+61 422 333 444',
    whatsapp: '+61422333444',
    website: 'https://example.com/sanaa-boutique',
    address: 'Shop 4, 220 Haldon Street, Lakemba NSW 2195',
    description: 'Modest fashion, abayas and formal wear with in-store tailoring and alterations.',
    coverColor: '#d78a2e',
    secondaryColor: '#a7651e',
    promotionIds: [],
    verified: true,
  },
  {
    id: 'rizvi-tax-accounting',
    name: 'Rizvi Tax & Accounting',
    initials: 'RT',
    categoryId: 'professional',
    category: 'Professional Services',
    tier: 'standard',
    city: 'sydney',
    suburb: 'Punchbowl',
    distanceKm: 5.5,
    openNow: true,
    hoursSummary: 'Open until 5:00 PM',
    abn: '66 158 940 213',
    phone: '+61 433 444 555',
    whatsapp: '+61433444555',
    website: 'https://example.com/rizvi-tax-accounting',
    address: 'Suite 3, 88 Punchbowl Road, Punchbowl NSW 2196',
    description: 'Tax returns, small business BAS and bookkeeping. First consultation is free for community members.',
    coverColor: '#346782',
    secondaryColor: '#24485b',
    promotionIds: ['free-first-consult'],
    verified: true,
  },
  {
    id: 'care-plus-dental',
    name: 'Care Plus Dental',
    initials: 'CD',
    categoryId: 'health',
    category: 'Health & Wellness',
    tier: 'free',
    city: 'melbourne',
    suburb: 'Dandenong',
    distanceKm: 7.8,
    openNow: true,
    hoursSummary: 'Open until 7:00 PM',
    abn: '19 602 774 108',
    phone: '+61 444 555 666',
    whatsapp: '+61444555666',
    website: 'https://example.com/care-plus-dental',
    address: '5/40 Thomas Street, Dandenong VIC 3175',
    description: 'Family dental clinic with evening and weekend appointments available.',
    coverColor: '#3d8f81',
    secondaryColor: '#285f56',
    promotionIds: [],
    verified: true,
  },
  {
    id: 'bright-minds-tutoring',
    name: 'Bright Minds Tutoring',
    initials: 'BM',
    categoryId: 'education',
    category: 'Education',
    tier: 'free',
    city: 'canberra',
    suburb: 'Gungahlin',
    distanceKm: 10.2,
    openNow: false,
    hoursSummary: 'Opens at 4:00 PM',
    abn: '27 341 059 882',
    phone: '+61 455 666 777',
    whatsapp: '+61455666777',
    website: 'https://example.com/bright-minds-tutoring',
    address: 'Community Hall, 3 Amy Street, Gungahlin ACT 2912',
    description: 'Primary and high school tutoring, plus Quran classes on weekends.',
    coverColor: '#815b9f',
    secondaryColor: '#5d4074',
    promotionIds: ['term-three-enrolment'],
    verified: true,
  },
];

export const SAMPLE_PROMOTIONS = [
  {
    id: 'eid-catering-special',
    businessId: 'zaiqa-home-kitchen',
    title: 'Eid Catering Special',
    offer: '15% off orders over $150',
    endsLabel: 'Ends 31 Aug',
    boosted: true,
  },
  {
    id: 'second-event-saving',
    businessId: 'al-noor-photography',
    title: 'Book Two Events and Save',
    offer: '$100 off your second booking',
    endsLabel: 'Ends 1 Sep',
    boosted: true,
  },
  {
    id: 'free-first-consult',
    businessId: 'rizvi-tax-accounting',
    title: 'Free First Consultation',
    offer: 'Available to new community clients',
    endsLabel: 'Ongoing',
    boosted: false,
  },
  {
    id: 'term-three-enrolment',
    businessId: 'bright-minds-tutoring',
    title: 'Term Three Enrolment Offer',
    offer: 'Save on a full-term learning plan',
    endsLabel: 'Ends 15 Sep',
    boosted: false,
  },
];

const TIER_RANK = { featured: 0, standard: 1, free: 2 };

export function filterAndRankBusinesses({
  businesses = SAMPLE_BUSINESSES,
  categoryId = 'all',
  subcategoryId = '',
  city = '',
  query = '',
  openOnly = false,
} = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return businesses
    .filter(business => categoryId === 'all' || (
      Array.isArray(business.categoryIds)
        ? business.categoryIds.includes(categoryId)
        : business.categoryId === categoryId
    ))
    .filter(business => !subcategoryId || (Array.isArray(business.subcategoryIds) && business.subcategoryIds.includes(subcategoryId)))
    .filter(business => !city || business.city === city)
    .filter(business => !openOnly || business.openNow)
    .filter(business => !normalizedQuery || [
      business.name,
      business.category,
      ...(Array.isArray(business.subcategories) ? business.subcategories.map(item => item.label || item) : []),
      business.suburb,
      business.description,
    ].join(' ').toLowerCase().includes(normalizedQuery))
    .sort((left, right) => (
      (TIER_RANK[left.tier] ?? 9) - (TIER_RANK[right.tier] ?? 9)
      || left.name.localeCompare(right.name)
    ));
}

export function promotionsWithBusinesses() {
  return SAMPLE_PROMOTIONS
    .map(promotion => ({
      ...promotion,
      business: SAMPLE_BUSINESSES.find(business => business.id === promotion.businessId),
    }))
    .filter(promotion => promotion.business)
    .sort((left, right) => Number(right.boosted) - Number(left.boosted));
}

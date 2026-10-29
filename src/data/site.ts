// Site-wide settings: contact info, navigation, tracking IDs.
// Edit this file to change the header menu, phone number, etc.

export const site = {
  name: 'Tangible Therapy',
  url: 'https://tangiblementalhealth.com',
  phone: '435-260-5406',
  phoneHref: 'tel:4352605406',
  email: 'frontdesk@tangiblementalhealth.com',
  clientPortal: 'https://tangible.clientsecure.me/',
  logo: '/images/asset-1-3x-37f4d6.png',
  // Website chat bubble (src/components/ChatWidget.astro). false = hidden everywhere.
  chatbot: true,
  // Staff chatbot on staff pages (src/components/StaffChat.astro, /api/staff-chat). false = hidden everywhere.
  staffChatbot: true,
  socialImage: '/images/tangiblegreen-7e3f0d.png',
  defaultDescription:
    'Discover the best therapists in Utah County at Tangible Therapy. Expert counseling for anxiety, trauma, couples, and EMDR. Get a free consultation today!',
  offices: [
    { name: 'Orem Office', address: '246 N Orem Blvd', city: 'Orem', region: 'UT', zip: '84057', url: '/orem-office' },
    { name: 'Provo Office', address: '201 E Center St', city: 'Provo', region: 'UT', zip: '84606', url: '/provo-office' },
    { name: 'Sandy Office', address: '11075 S State St Bldg 33', city: 'Sandy', region: 'UT', zip: '84070', url: '/sandy' },
  ],
  social: {
    instagram: 'https://www.instagram.com/tangible_therapy/',
    facebook: 'https://www.facebook.com/profile.php?id=100083729585174',
  },
  // Analytics / tracking carried over from Squarespace
  tracking: {
    gtm: 'GTM-PBGX88VJ',
    ga4: ['G-9NKMQE917G', 'G-BPLH89FCRP'],
    metaPixel: '1706769979926705',
    callrail: '//cdn.callrail.com/companies/729555396/d433c6bde36b5ae4d250/12/swap.js',
  },
};

type Link = { label: string; href: string };
type NavItem = Link | { label: string; children: Link[] };

export const nav: NavItem[] = [
  {
    label: 'Our Team',
    children: [
      { label: 'Why Choose Tangible?', href: '/why-choose-tangible' },
      { label: 'Our Therapists', href: '/ourteam' },
      { label: 'About Tangible', href: '/about-tangible' },
    ],
  },
  {
    label: 'Locations',
    children: [
      { label: 'Orem', href: '/orem-office' },
      { label: 'Provo', href: '/provo-office' },
      { label: 'Sandy', href: '/sandy' },
    ],
  },
  {
    label: 'Services',
    children: [
      { label: 'Counseling', href: '/counseling' },
      { label: 'Telehealth', href: '/telehealth' },
      { label: 'Couples Counseling', href: '/couples-counseling' },
      { label: 'Anxiety Therapy', href: '/anxiety-therapy' },
      { label: 'ADHD Therapy', href: '/adhd-therapy' },
      { label: 'Autism Therapy', href: '/autism-therapy' },
      { label: 'Depression Therapy', href: '/depression-therapy' },
      { label: 'Eating Disorder Therapy', href: '/eating-disorder-therapy' },
      { label: 'EMDR Therapy', href: '/emdr-therapy' },
      { label: 'Family Counseling', href: '/family-counseling' },
      { label: 'Faith Transition Therapy', href: '/faith-transition-therapy' },
      { label: 'Grief Therapy', href: '/grief-therapy' },
      { label: 'Group Therapy', href: '/group-therapy' },
      { label: 'Internal Family Systems Therapy', href: '/internal-family-systems-therapy' },
      { label: 'LGBTQ+ Therapy', href: '/lgbtq-therapy' },
      { label: 'OCD Treatment', href: '/ocd-treatment' },
      { label: 'PTSD Therapy', href: '/ptsd-therapy' },
      { label: 'Trauma Therapy', href: '/trauma-therapy' },
      { label: 'Therapy for Teens', href: '/therapy-for-teens' },
      { label: 'Insurance We Accept', href: '/insurance-we-accept' },
    ],
  },
  { label: 'Contact', href: '/contact' },
  {
    label: 'For Professionals',
    children: [
      { label: "Free CEU's", href: '/ceu' },
      { label: 'Careers', href: '/careers' },
    ],
  },
];

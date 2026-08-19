const CREATORS = {
  'ashok-verma': {
    slug: 'ashok-verma',
    displayName: 'Ashok Verma',
    contactEmail: 'HelloAshokVerma@gmail.com',
    offers: [
      {
        id: 'discovery-call',
        title: 'Discovery Call',
        description: '15 mins • Video Call',
        price: { amount: 0, currency: 'INR' },
        durationMinutes: 15,
        paymentEnabled: false,
      },
      {
        id: 'mentorship-strategy',
        title: '1:1 Mentorship & Strategy',
        description: '60 mins • Deep Dive',
        price: { amount: 1250, currency: 'INR' },
        durationMinutes: 60,
        paymentEnabled: false,
      },
      {
        id: 'portfolio-review',
        title: 'Portfolio Review',
        description: '45 mins • Feedback Session',
        price: { amount: 1250, currency: 'INR' },
        durationMinutes: 45,
        paymentEnabled: false,
      },
    ],
  },
};

export function getCreator(slug) {
  return CREATORS[slug] || null;
}

// Generated from the frontend mock catalog (src/data/services.ts).
// Demo data only: example.com emails, illustrative profiles, prices in cents, no ratings or reviews.

export const seedTechnicians = [
  {
    "key": "amira",
    "name": "Amira Chen",
    "email": "amira.chen@example.com",
    "bio": "Sample technician profile for the FixMate demo catalog. Experience and biography are illustrative."
  },
  {
    "key": "daniel",
    "name": "Daniel Foster",
    "email": "daniel.foster@example.com",
    "bio": "Sample technician profile for the FixMate demo catalog. Experience and biography are illustrative."
  },
  {
    "key": "rafiq",
    "name": "Rafiq Hasan",
    "email": "rafiq.hasan@example.com",
    "bio": "Sample technician profile for the FixMate demo catalog. Experience and biography are illustrative."
  },
  {
    "key": "priya",
    "name": "Priya Nair",
    "email": "priya.nair@example.com",
    "bio": "Sample technician profile for the FixMate demo catalog. Experience and biography are illustrative."
  },
  {
    "key": "mateo",
    "name": "Mateo Alvarez",
    "email": "mateo.alvarez@example.com",
    "bio": "Sample technician profile for the FixMate demo catalog. Experience and biography are illustrative."
  },
  {
    "key": "grace",
    "name": "Grace Okafor",
    "email": "grace.okafor@example.com",
    "bio": "Sample technician profile for the FixMate demo catalog. Experience and biography are illustrative."
  }
] as const;

export type SeedTechnicianKey = (typeof seedTechnicians)[number]["key"];

export type SeedService = {
  technicianKey: SeedTechnicianKey;
  title: string;
  category: string;
  description: string;
  details: string;
  price: number;
  image: string;
  includes: string[];
  availability: string;
  isFeatured: boolean;
};

export const seedServices: SeedService[] = [
  {
    "technicianKey": "amira",
    "title": "Phone screen replacement",
    "category": "Smartphone",
    "description": "A clean, precise screen repair with quality tested parts.",
    "details": "Example phone screen service details for the FixMate demo catalog. A provider would confirm the device model, part options, and final quote before work begins.",
    "price": 4900,
    "image": "/images/smartphone-screen-repair.webp",
    "includes": [
      "Device inspection",
      "Repair options review",
      "Post-repair function check"
    ],
    "availability": "Example weekday and Saturday appointments",
    "isFeatured": true
  },
  {
    "technicianKey": "daniel",
    "title": "Laptop diagnostic & tune-up",
    "category": "Laptop & PC",
    "description": "Get to the root of slowdowns, heat and unexpected crashes.",
    "details": "Example laptop diagnostic details for the FixMate demo catalog. The technician would discuss the findings and any additional work before proceeding.",
    "price": 3900,
    "image": "/images/laptop-repair.webp",
    "includes": [
      "Startup and performance checks",
      "Thermal inspection",
      "Recommended next steps"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": true
  },
  {
    "technicianKey": "rafiq",
    "title": "Air conditioner service",
    "category": "Air Conditioning",
    "description": "Seasonal cleaning and performance checks for a cooler home.",
    "details": "Example air conditioner service details for the FixMate demo catalog. The scope and any required parts would be confirmed after an initial inspection.",
    "price": 6900,
    "image": "/images/air-conditioner-service.webp",
    "includes": [
      "Filter and airflow inspection",
      "Basic unit cleaning",
      "Operation check"
    ],
    "availability": "Example weekday and weekend appointments",
    "isFeatured": true
  },
  {
    "technicianKey": "priya",
    "title": "Refrigerator maintenance",
    "category": "Home Appliances",
    "description": "Routine care to keep your refrigerator clean and running well.",
    "details": "Example refrigerator maintenance details for the FixMate demo catalog. A technician would confirm the appliance and the requested maintenance before scheduling.",
    "price": 5500,
    "image": "/images/refrigerator-maintenance.webp",
    "includes": [
      "Door seal check",
      "Interior care guidance",
      "Cooling performance check"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": true
  },
  {
    "technicianKey": "mateo",
    "title": "TV troubleshooting",
    "category": "Television",
    "description": "Restore the picture, sound and connections you rely on.",
    "details": "Example television troubleshooting details for the FixMate demo catalog. Repair options and parts would be discussed after diagnosis.",
    "price": 4500,
    "image": "/images/television-repair.webp",
    "includes": [
      "Display and sound checks",
      "Connection inspection",
      "Repair recommendations"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": true
  },
  {
    "technicianKey": "grace",
    "title": "Home electrical check",
    "category": "Electrical Services",
    "description": "A careful inspection of outlets, switches and lighting.",
    "details": "Example home electrical inspection details for the FixMate demo catalog. Work scope and any safety concerns would be explained before repair work begins.",
    "price": 5900,
    "image": "/images/electrical-service.webp",
    "includes": [
      "Outlet and switch inspection",
      "Lighting check",
      "Written next steps"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": true
  },
  {
    "technicianKey": "amira",
    "title": "Phone battery replacement",
    "category": "Smartphone",
    "description": "Check battery health and review replacement options.",
    "details": "Example phone battery service details for the FixMate demo catalog. Device compatibility and parts would be confirmed with the provider.",
    "price": 3500,
    "image": "/images/smartphone-screen-repair.webp",
    "includes": [
      "Battery health check",
      "Replacement options",
      "Charging function check"
    ],
    "availability": "Example weekday and Saturday appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "amira",
    "title": "Phone charging port service",
    "category": "Smartphone",
    "description": "Inspect charging issues and clean accessible port debris.",
    "details": "Example charging port service details for the FixMate demo catalog. Any hardware repair would be quoted separately after inspection.",
    "price": 2500,
    "image": "/images/smartphone-screen-repair.webp",
    "includes": [
      "Charging symptom review",
      "Accessible port cleaning",
      "Charging test"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "daniel",
    "title": "Laptop keyboard repair",
    "category": "Laptop & PC",
    "description": "Investigate unresponsive, damaged or sticking laptop keys.",
    "details": "Example laptop keyboard service details for the FixMate demo catalog. The device model and compatible replacement parts would be confirmed first.",
    "price": 6500,
    "image": "/images/laptop-repair.webp",
    "includes": [
      "Keyboard inspection",
      "Repair options",
      "Key function test"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "daniel",
    "title": "Laptop thermal cleaning",
    "category": "Laptop & PC",
    "description": "Check cooling performance and clear accessible ventilation.",
    "details": "Example laptop thermal service details for the FixMate demo catalog. The technician would explain any additional maintenance recommendations.",
    "price": 4900,
    "image": "/images/laptop-repair.webp",
    "includes": [
      "Fan and vent inspection",
      "Accessible dust removal",
      "Temperature check"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "priya",
    "title": "Refrigerator cooling check",
    "category": "Home Appliances",
    "description": "Review temperature, door seals and everyday cooling concerns.",
    "details": "Example refrigerator cooling service details for the FixMate demo catalog. Diagnosis and any repair quote would be confirmed during the appointment.",
    "price": 4500,
    "image": "/images/refrigerator-maintenance.webp",
    "includes": [
      "Temperature review",
      "Door seal check",
      "Recommended next steps"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "mateo",
    "title": "TV picture and sound check",
    "category": "Television",
    "description": "Check picture quality, sound output and connected devices.",
    "details": "Example television picture and sound service details for the FixMate demo catalog. The provider would discuss findings before any repair.",
    "price": 3500,
    "image": "/images/television-repair.webp",
    "includes": [
      "Display test",
      "Audio check",
      "Input and cable review"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "grace",
    "title": "Electrical outlet inspection",
    "category": "Electrical Services",
    "description": "Inspect outlet and switch concerns around your home.",
    "details": "Example electrical outlet service details for the FixMate demo catalog. A qualified professional would confirm the work scope before starting.",
    "price": 3900,
    "image": "/images/electrical-service.webp",
    "includes": [
      "Outlet symptom review",
      "Visual inspection",
      "Repair recommendations"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "rafiq",
    "title": "Air conditioner cleaning",
    "category": "Air Conditioning",
    "description": "Clean accessible filters and check airflow performance.",
    "details": "Example air conditioner cleaning details for the FixMate demo catalog. Unit type and cleaning scope would be confirmed before a visit.",
    "price": 4900,
    "image": "/images/air-conditioner-service.webp",
    "includes": [
      "Filter care",
      "Airflow check",
      "Basic operation test"
    ],
    "availability": "Example weekday and weekend appointments",
    "isFeatured": false
  },
  {
    "technicianKey": "priya",
    "title": "Small appliance assessment",
    "category": "Home Appliances",
    "description": "Get an initial assessment for a small household appliance.",
    "details": "Example small appliance assessment details for the FixMate demo catalog. Appliance type and available repair options would be reviewed with a provider.",
    "price": 2900,
    "image": "/images/refrigerator-maintenance.webp",
    "includes": [
      "Appliance symptom review",
      "Initial inspection",
      "Next step recommendations"
    ],
    "availability": "Example weekday appointments",
    "isFeatured": false
  }
];

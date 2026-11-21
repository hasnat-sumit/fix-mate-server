// Demo data for the live site: connected users, services and bookings so every flow can be tested.
// Emails use the reserved example.com domain. Images are the frontend's bundled /images/ assets.

import type { ServiceCategory } from "../modules/services/services.model.js";

export type SeedUser = {
  key: string;
  name: string;
  email: string;
  phone: string;
  area: string;
  bio: string;
};

export const seedTechnicians = [
  {
    key: "rafiq",
    name: "Rafiq Hasan",
    email: "rafiq.technician@example.com",
    phone: "+880 1700-000101",
    area: "Mirpur, Dhaka",
    bio: "Smartphone and laptop technician with 8 years of bench experience: screens, batteries, charging ports, keyboards and thermal servicing.",
  },
  {
    key: "nusrat",
    name: "Nusrat Jahan",
    email: "nusrat.technician@example.com",
    phone: "+880 1700-000102",
    area: "Dhanmondi, Dhaka",
    bio: "Certified HVAC and home appliance technician. Air conditioners, refrigerators and washing machines, serviced at your home.",
  },
  {
    key: "tanvir",
    name: "Tanvir Ahmed",
    email: "tanvir.technician@example.com",
    phone: "+880 1700-000103",
    area: "Uttara, Dhaka",
    bio: "Licensed electrician and TV repair specialist. LED/LCD panel faults, home wiring, switches and safety inspections.",
  },
] as const satisfies readonly SeedUser[];

export const seedCustomers = [
  {
    key: "sadia",
    name: "Sadia Rahman",
    email: "sadia.customer@example.com",
    phone: "+880 1800-000201",
    area: "Gulshan, Dhaka",
    bio: "",
  },
  {
    key: "arif",
    name: "Arif Hossain",
    email: "arif.customer@example.com",
    phone: "+880 1800-000202",
    area: "Mohammadpur, Dhaka",
    bio: "",
  },
] as const satisfies readonly SeedUser[];

export type SeedTechnicianKey = (typeof seedTechnicians)[number]["key"];
export type SeedCustomerKey = (typeof seedCustomers)[number]["key"];

export type SeedService = {
  key: string;
  technician: SeedTechnicianKey;
  title: string;
  category: ServiceCategory;
  description: string;
  image: string;
  basePrice: number;
  estimatedDuration: string;
  serviceMode: "Home Visit" | "Shop Drop-off";
  serviceArea: string;
  approvalStatus: "approved" | "pending" | "rejected";
  /** Days before the seed run, so "Newest" sorting and the featured section have a stable order. */
  createdDaysAgo: number;
};

const IMG = {
  phone: "/images/smartphone-screen-repair.webp",
  laptop: "/images/laptop-repair.webp",
  ac: "/images/air-conditioner-service.webp",
  fridge: "/images/refrigerator-maintenance.webp",
  tv: "/images/television-repair.webp",
  electrical: "/images/electrical-service.webp",
};

export const seedServices: SeedService[] = [
  // Rafiq — Smartphone, Laptop & PC
  {
    key: "phone-screen",
    technician: "rafiq",
    title: "iPhone & Android Screen Replacement",
    category: "Smartphone",
    description:
      "Cracked or unresponsive display replaced with a quality tested panel. Includes a full touch, camera and Face ID/fingerprint check after the repair, plus a 3-month warranty on the part.",
    image: IMG.phone,
    basePrice: 45,
    estimatedDuration: "1-2 hours",
    serviceMode: "Shop Drop-off",
    serviceArea: "Mirpur, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 30,
  },
  {
    key: "phone-battery",
    technician: "rafiq",
    title: "Smartphone Battery Replacement",
    category: "Smartphone",
    description:
      "Phone dying by afternoon or shutting down at 20%? We replace the worn battery with a new high-capacity cell, recalibrate charging and test for swelling or heat issues.",
    image: IMG.phone,
    basePrice: 25,
    estimatedDuration: "1 hour",
    serviceMode: "Shop Drop-off",
    serviceArea: "Mirpur, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 27,
  },
  {
    key: "phone-port",
    technician: "rafiq",
    title: "Charging Port Cleaning & Repair",
    category: "Smartphone",
    description:
      "Loose cable or slow charging fixed: the port is cleaned of lint and corrosion, and replaced if damaged. Fast-charging and data transfer are tested before handover.",
    image: IMG.phone,
    basePrice: 18,
    estimatedDuration: "45 minutes",
    serviceMode: "Home Visit",
    serviceArea: "Mirpur & Pallabi, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 22,
  },
  {
    key: "laptop-tuneup",
    technician: "rafiq",
    title: "Laptop Diagnostic & Performance Tune-up",
    category: "Laptop & PC",
    description:
      "Slow boot, freezes or random restarts diagnosed end to end: storage health, RAM, startup programs and malware. Includes OS optimisation and an upgrade recommendation if needed.",
    image: IMG.laptop,
    basePrice: 30,
    estimatedDuration: "2-3 hours",
    serviceMode: "Shop Drop-off",
    serviceArea: "Mirpur, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 20,
  },
  {
    key: "laptop-keyboard",
    technician: "rafiq",
    title: "Laptop Keyboard Replacement",
    category: "Laptop & PC",
    description:
      "Sticky, missing or dead keys? The keyboard is replaced with a model-matched part, backlight included where supported, and every key is tested after fitting.",
    image: IMG.laptop,
    basePrice: 40,
    estimatedDuration: "1 day",
    serviceMode: "Shop Drop-off",
    serviceArea: "Mirpur, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 16,
  },
  {
    key: "laptop-thermal",
    technician: "rafiq",
    title: "Laptop Overheating Fix & Thermal Paste",
    category: "Laptop & PC",
    description:
      "Fan noise and overheating solved with an internal dust clean, fresh thermal paste on CPU/GPU and a fan check. Stress-tested afterwards to confirm lower temperatures.",
    image: IMG.laptop,
    basePrice: 22,
    estimatedDuration: "2 hours",
    serviceMode: "Home Visit",
    serviceArea: "Mirpur & Kafrul, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 12,
  },
  // Nusrat — AC, Refrigerator, Washing Machine
  {
    key: "ac-service",
    technician: "nusrat",
    title: "Split AC Full Servicing",
    category: "AC",
    description:
      "Complete split AC service at home: indoor and outdoor unit wash, filter and coil cleaning, drain line flush, gas pressure check and cooling performance test.",
    image: IMG.ac,
    basePrice: 28,
    estimatedDuration: "2 hours",
    serviceMode: "Home Visit",
    serviceArea: "Dhanmondi & Lalmatia, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 29,
  },
  {
    key: "ac-gas",
    technician: "nusrat",
    title: "AC Gas Refill & Leak Repair",
    category: "AC",
    description:
      "AC running but not cooling? We locate and seal refrigerant leaks, vacuum the system and recharge it with the correct gas to the manufacturer's pressure.",
    image: IMG.ac,
    basePrice: 55,
    estimatedDuration: "3-4 hours",
    serviceMode: "Home Visit",
    serviceArea: "Dhanmondi, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 18,
  },
  {
    key: "fridge-maintenance",
    technician: "nusrat",
    title: "Refrigerator Cooling Problem Repair",
    category: "Refrigerator",
    description:
      "Fridge not cooling, freezing up or leaking water? Diagnosis of thermostat, compressor relay, fan and defrost system, with on-site repair for most faults.",
    image: IMG.fridge,
    basePrice: 35,
    estimatedDuration: "2-3 hours",
    serviceMode: "Home Visit",
    serviceArea: "Dhanmondi & Mohammadpur, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 25,
  },
  {
    key: "fridge-gas",
    technician: "nusrat",
    title: "Refrigerator Gas Charging",
    category: "Refrigerator",
    description:
      "Restores cooling in refrigerators that have lost refrigerant: leak test, brazing repair where needed, vacuum and recharge, followed by a 24-hour temperature check.",
    image: IMG.fridge,
    basePrice: 48,
    estimatedDuration: "1 day",
    serviceMode: "Home Visit",
    serviceArea: "Dhanmondi, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 9,
  },
  {
    key: "washer-repair",
    technician: "nusrat",
    title: "Washing Machine Repair (Front & Top Load)",
    category: "Washing Machine",
    description:
      "Drum not spinning, water not draining or error codes on the display? Motor, pump, belt and control board diagnosis with repair at your home.",
    image: IMG.fridge,
    basePrice: 32,
    estimatedDuration: "2-3 hours",
    serviceMode: "Home Visit",
    serviceArea: "Dhanmondi & Kalabagan, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 6,
  },
  // Tanvir — TV, Electrical
  {
    key: "tv-repair",
    technician: "tanvir",
    title: "LED/LCD TV Display & Power Repair",
    category: "TV",
    description:
      "No picture, lines on screen, or TV won't turn on? Power board, backlight and T-con faults diagnosed and repaired, with a full picture and sound test.",
    image: IMG.tv,
    basePrice: 38,
    estimatedDuration: "1-2 days",
    serviceMode: "Shop Drop-off",
    serviceArea: "Uttara, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 24,
  },
  {
    key: "tv-mount",
    technician: "tanvir",
    title: "TV Wall Mounting & Setup",
    category: "TV",
    description:
      "Secure wall mounting for TVs up to 75 inches with a level, hidden-cable finish, followed by channel, Wi-Fi and smart app setup.",
    image: IMG.tv,
    basePrice: 20,
    estimatedDuration: "1-2 hours",
    serviceMode: "Home Visit",
    serviceArea: "Uttara & Airport, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 4,
  },
  {
    key: "wiring-check",
    technician: "tanvir",
    title: "Home Electrical Wiring Inspection",
    category: "Electrical",
    description:
      "Full safety check of your home's wiring, distribution board, earthing and breakers. You get a written list of issues found and a quote for any repairs.",
    image: IMG.electrical,
    basePrice: 26,
    estimatedDuration: "2-3 hours",
    serviceMode: "Home Visit",
    serviceArea: "Uttara, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 14,
  },
  {
    key: "switch-socket",
    technician: "tanvir",
    title: "Switch, Socket & Light Fitting Repair",
    category: "Electrical",
    description:
      "Faulty switches, sparking sockets or flickering lights repaired or replaced with quality fittings. Price covers the visit and up to three points.",
    image: IMG.electrical,
    basePrice: 15,
    estimatedDuration: "1 hour",
    serviceMode: "Home Visit",
    serviceArea: "Uttara & Uttarkhan, Dhaka",
    approvalStatus: "approved",
    createdDaysAgo: 2,
  },
  // Waiting for and refused by the admin, so the approval screens have something to show.
  {
    key: "washer-drum",
    technician: "nusrat",
    title: "Washing Machine Drum Bearing Replacement",
    category: "Washing Machine",
    description:
      "Loud rumbling during the spin cycle usually means worn drum bearings. We replace the bearings and seals and test the machine through a full wash cycle.",
    image: IMG.fridge,
    basePrice: 60,
    estimatedDuration: "1 day",
    serviceMode: "Home Visit",
    serviceArea: "Dhanmondi, Dhaka",
    approvalStatus: "pending",
    createdDaysAgo: 1,
  },
  {
    key: "fan-install",
    technician: "tanvir",
    title: "Ceiling Fan Installation",
    category: "Electrical",
    description:
      "New ceiling fan fitted with a secure hook, regulator wiring and balance check. Old fan removed and taken away on request.",
    image: IMG.electrical,
    basePrice: 12,
    estimatedDuration: "1 hour",
    serviceMode: "Home Visit",
    serviceArea: "Uttara, Dhaka",
    approvalStatus: "rejected",
    createdDaysAgo: 3,
  },
];

export type SeedServiceKey = (typeof seedServices)[number]["key"];

export type SeedBooking = {
  customer: SeedCustomerKey;
  service: SeedServiceKey;
  address: string;
  problemDescription: string;
  /** Negative = in the past. */
  preferredInDays: number;
  /** The path the job took; the last entry is its current status. */
  path: ("requested" | "accepted" | "rejected" | "in-progress" | "completed" | "cancelled")[];
  finalAmount?: number;
  paid?: boolean;
  rating?: number;
  review?: string;
  createdDaysAgo: number;
};

/** Bookings in every status. Rafiq (the main test technician) has a job in each one. */
export const seedBookings: SeedBooking[] = [
  {
    customer: "sadia",
    service: "phone-screen",
    address: "House 12, Road 45, Gulshan 2, Dhaka",
    problemDescription: "Dropped my phone and the screen is cracked across the top. Touch stops working on the right side.",
    preferredInDays: 3,
    path: ["requested"],
    createdDaysAgo: 0,
  },
  {
    customer: "arif",
    service: "laptop-keyboard",
    address: "Flat 4B, Block C, Tajmahal Road, Mohammadpur, Dhaka",
    problemDescription: "Spilled tea on the keyboard last week. The E, R and space keys no longer respond at all.",
    preferredInDays: 2,
    path: ["requested", "accepted"],
    createdDaysAgo: 2,
  },
  {
    customer: "sadia",
    service: "laptop-tuneup",
    address: "House 12, Road 45, Gulshan 2, Dhaka",
    problemDescription: "Laptop takes about five minutes to boot and freezes whenever I open more than a few browser tabs.",
    preferredInDays: -1,
    path: ["requested", "accepted", "in-progress"],
    createdDaysAgo: 4,
  },
  {
    customer: "arif",
    service: "phone-battery",
    address: "Flat 4B, Block C, Tajmahal Road, Mohammadpur, Dhaka",
    problemDescription: "Battery drains from full to 20% in about three hours and the phone gets hot while charging.",
    preferredInDays: -4,
    path: ["requested", "accepted", "in-progress", "completed"],
    finalAmount: 28,
    createdDaysAgo: 7,
  },
  {
    customer: "sadia",
    service: "phone-port",
    address: "House 12, Road 45, Gulshan 2, Dhaka",
    problemDescription: "Charger only works if I hold the cable at an angle. It has become worse over the last month.",
    preferredInDays: -9,
    path: ["requested", "accepted", "in-progress", "completed"],
    finalAmount: 18,
    paid: true,
    rating: 5,
    review: "Quick and careful work. Charging is perfect again and he explained what was wrong.",
    createdDaysAgo: 12,
  },
  {
    customer: "arif",
    service: "laptop-thermal",
    address: "Flat 4B, Block C, Tajmahal Road, Mohammadpur, Dhaka",
    problemDescription: "Laptop fan is extremely loud and the bottom gets too hot to keep on my lap during video calls.",
    preferredInDays: -2,
    path: ["requested", "rejected"],
    createdDaysAgo: 5,
  },
  {
    customer: "sadia",
    service: "laptop-keyboard",
    address: "House 12, Road 45, Gulshan 2, Dhaka",
    problemDescription: "Some keys on my laptop keyboard are sticky and the backlight stopped working on the left half.",
    preferredInDays: -6,
    path: ["requested", "cancelled"],
    createdDaysAgo: 8,
  },
  {
    customer: "arif",
    service: "ac-service",
    address: "Flat 4B, Block C, Tajmahal Road, Mohammadpur, Dhaka",
    problemDescription: "Bedroom AC cools very slowly and water drips from the indoor unit onto the wall.",
    preferredInDays: -14,
    path: ["requested", "accepted", "in-progress", "completed"],
    finalAmount: 32,
    paid: true,
    createdDaysAgo: 17,
  },
  {
    customer: "sadia",
    service: "fridge-maintenance",
    address: "House 12, Road 45, Gulshan 2, Dhaka",
    problemDescription: "The freezer works but the fridge section is warm, and there is ice building up at the back.",
    preferredInDays: 5,
    path: ["requested"],
    createdDaysAgo: 1,
  },
  {
    customer: "sadia",
    service: "tv-repair",
    address: "House 12, Road 45, Gulshan 2, Dhaka",
    problemDescription: "TV turns on with sound but the screen stays black. A faint picture is visible with a torch.",
    preferredInDays: 1,
    path: ["requested", "accepted"],
    createdDaysAgo: 3,
  },
];

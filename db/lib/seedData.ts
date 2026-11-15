/**
 * Static reference data for the CampusConnect seed.
 * Everything here is synthetic (names, e-mails on the reserved .invalid TLD).
 */

export const HOSTELS = [
  { hostel_name: 'Krishna', hostel_type: 'UG Residence', warden_name: 'Dr. Vikram Shetty', gender: 'MALE', wings: ['A', 'B', 'C', 'D'] },
  { hostel_name: 'Ram', hostel_type: 'UG Residence', warden_name: 'Prof. Anil Deshpande', gender: 'MALE', wings: ['A', 'B', 'C', 'D'] },
  { hostel_name: 'Valmiki', hostel_type: 'UG Residence', warden_name: 'Dr. Suresh Kamath', gender: 'MALE', wings: ['A', 'B', 'C', 'D'] },
  { hostel_name: 'Vishwakarma', hostel_type: 'UG & PG Residence', warden_name: 'Prof. Harish Nambiar', gender: 'MALE', wings: ['A', 'B', 'C', 'D'] },
  { hostel_name: 'Malviya', hostel_type: 'UG Residence', warden_name: 'Dr. Lakshmi Varadhan', gender: 'FEMALE', wings: ['A', 'B'] },
  { hostel_name: 'Meera', hostel_type: 'UG & PG Residence', warden_name: 'Prof. Neha Kulkarni', gender: 'FEMALE', wings: ['A', 'B'] },
] as const;

/** Floors 0 (ground) .. 4, 26 rooms per floor per wing.  room_no = <wing>-<floor><nn>, e.g. C-315 */
export const FLOORS = 5;
export const ROOMS_PER_FLOOR_PER_WING = 26;

export const ADMINS = [
  { full_name: 'SWD Office (Demo Admin)', email: 'admin@campusconnect.invalid', role: 'SWD Administrator' },
  { full_name: 'Dr. Rakesh Menon', email: 'chief.warden@campusconnect.invalid', role: 'Chief Warden' },
  { full_name: 'Prof. Sunita Rao', email: 'swd.dean@campusconnect.invalid', role: 'Associate Dean, SWD' },
  { full_name: 'Dr. Vikram Shetty', email: 'warden.krishna@campusconnect.invalid', role: 'Warden - Krishna' },
  { full_name: 'Prof. Anil Deshpande', email: 'warden.ram@campusconnect.invalid', role: 'Warden - Ram' },
  { full_name: 'Dr. Suresh Kamath', email: 'warden.valmiki@campusconnect.invalid', role: 'Warden - Valmiki' },
  { full_name: 'Prof. Harish Nambiar', email: 'warden.vishwakarma@campusconnect.invalid', role: 'Warden - Vishwakarma' },
  { full_name: 'Dr. Lakshmi Varadhan', email: 'warden.malviya@campusconnect.invalid', role: 'Warden - Malviya' },
  { full_name: 'Prof. Neha Kulkarni', email: 'warden.meera@campusconnect.invalid', role: 'Warden - Meera' },
  { full_name: 'Mr. Ramesh Pillai', email: 'stores@campusconnect.invalid', role: 'Campus Stores Manager' },
] as const;

/** Synthetic demo students - the ONLY accounts given transactions and logins. */
export const DEMO_STUDENTS = [
  { student_id: 'DEMO2023A7PS001H', full_name: 'Aarav Mehta', gender: 'MALE', program: 'B.E. Computer Science' },
  { student_id: 'DEMO2023B3PS002H', full_name: 'Ananya Iyer', gender: 'FEMALE', program: 'M.Sc. Economics + B.E. Electrical' },
  { student_id: 'DEMO2024A3PS003H', full_name: 'Rohan Verma', gender: 'MALE', program: 'B.E. Electrical & Electronics' },
  { student_id: 'DEMO2024A7PS004H', full_name: 'Diya Sharma', gender: 'FEMALE', program: 'B.E. Computer Science' },
  { student_id: 'DEMO2024AAPS005H', full_name: 'Kabir Singh', gender: 'MALE', program: 'B.E. Electronics & Communication' },
  { student_id: 'DEMO2025A4PS006H', full_name: 'Ishaan Reddy', gender: 'MALE', program: 'B.E. Mechanical' },
  { student_id: 'DEMO2025A7PS007H', full_name: 'Saanvi Nair', gender: 'FEMALE', program: 'B.E. Computer Science' },
  { student_id: 'DEMO2025B5PS008H', full_name: 'Arjun Rao', gender: 'MALE', program: 'M.Sc. Physics + B.E. Civil' },
  { student_id: 'DEMO2025A1PS009H', full_name: 'Kavya Joshi', gender: 'FEMALE', program: 'B.E. Chemical' },
  { student_id: 'DEMO2026A1PS010H', full_name: 'Vihaan Gupta', gender: 'MALE', program: 'B.E. Chemical' },
  { student_id: 'DEMO2026A8PS011H', full_name: 'Riya Das', gender: 'FEMALE', program: 'B.E. Electronics & Instrumentation' },
  { student_id: 'DEMO2026A7PS012H', full_name: 'Aditya Kulkarni', gender: 'MALE', program: 'B.E. Computer Science' },
] as const;

type Item = [name: string, category: string, price: number, available?: boolean];

export const STORES: {
  store_name: string; store_type: string; location: string; opens_at: string; closes_at: string; items: Item[];
}[] = [
  {
    store_name: 'Central Canteen', store_type: 'Food Court', location: 'Student Activity Centre, Ground Floor',
    opens_at: '07:30', closes_at: '22:00',
    items: [
      ['Masala Dosa', 'South Indian', 60], ['Idli Vada Combo', 'South Indian', 50], ['Veg Thali', 'Meals', 110],
      ['Chicken Biryani', 'Meals', 160], ['Paneer Butter Masala', 'Curries', 130], ['Butter Naan', 'Breads', 30],
      ['Veg Fried Rice', 'Chinese', 90], ['Chilli Paneer', 'Chinese', 120], ['Samosa (2 pcs)', 'Snacks', 30],
      ['Masala Chai', 'Beverages', 15], ['Filter Coffee', 'Beverages', 20], ['Gulab Jamun (2 pcs)', 'Desserts', 40],
    ],
  },
  {
    store_name: 'Night Canteen', store_type: 'Late-night Food', location: 'Between Krishna and Ram Bhawan',
    opens_at: '20:00', closes_at: '03:00',
    items: [
      ['Maggi Noodles', 'Snacks', 40], ['Cheese Maggi', 'Snacks', 55], ['Egg Bhurji Pav', 'Snacks', 60],
      ['Chicken Fried Rice', 'Chinese', 120], ['Veg Manchurian', 'Chinese', 90], ['Bread Omelette', 'Snacks', 45],
      ['Aloo Paratha', 'Breads', 50], ['Cold Coffee', 'Beverages', 50], ['Ginger Tea', 'Beverages', 15],
      ['Chocolate Brownie', 'Desserts', 60, false],
    ],
  },
  {
    store_name: 'Juice & Shakes Corner', store_type: 'Beverages', location: 'Library Lawns',
    opens_at: '09:00', closes_at: '23:00',
    items: [
      ['Fresh Lime Soda', 'Juices', 35], ['Watermelon Juice', 'Juices', 50], ['Mosambi Juice', 'Juices', 50],
      ['Mango Shake', 'Shakes', 80], ['Banana Shake', 'Shakes', 60], ['Oreo Shake', 'Shakes', 90],
      ['Cold Coffee with Ice Cream', 'Shakes', 90], ['Fruit Bowl', 'Healthy', 70], ['Lassi', 'Juices', 45],
    ],
  },
  {
    store_name: 'Campus Café', store_type: 'Café', location: 'Academic Block A, Atrium',
    opens_at: '08:00', closes_at: '20:00',
    items: [
      ['Cappuccino', 'Coffee', 90], ['Café Latte', 'Coffee', 100], ['Americano', 'Coffee', 80],
      ['Hot Chocolate', 'Coffee', 110], ['Veg Club Sandwich', 'Sandwiches', 120], ['Chicken Sandwich', 'Sandwiches', 140],
      ['Blueberry Muffin', 'Bakery', 70], ['Croissant', 'Bakery', 80], ['Pasta Arrabbiata', 'Mains', 160],
      ['Iced Tea', 'Coffee', 70],
    ],
  },
  {
    store_name: 'Sizzle Fast Food', store_type: 'Fast Food', location: 'Near Ram Bhawan',
    opens_at: '11:00', closes_at: '23:30',
    items: [
      ['Veg Burger', 'Burgers', 80], ['Chicken Burger', 'Burgers', 120], ['French Fries', 'Sides', 70],
      ['Peri Peri Fries', 'Sides', 90], ['Margherita Pizza', 'Pizza', 180], ['Farmhouse Pizza', 'Pizza', 240],
      ['Chicken Wrap', 'Wraps', 130], ['Paneer Wrap', 'Wraps', 110], ['Soft Drink (300 ml)', 'Beverages', 40],
      ['Choco Lava Cake', 'Desserts', 90],
    ],
  },
  {
    store_name: 'Annapurna Tiffins', store_type: 'South Indian', location: 'Shopping Complex, Shop 4',
    opens_at: '07:00', closes_at: '21:00',
    items: [
      ['Plain Dosa', 'Dosa', 40], ['Onion Uttapam', 'Dosa', 55], ['Pesarattu', 'Dosa', 60], ['Mysore Bonda', 'Snacks', 35],
      ['Upma', 'Breakfast', 35], ['Poori Bhaji', 'Breakfast', 50], ['Curd Rice', 'Rice', 50], ['Lemon Rice', 'Rice', 50],
      ['Badam Milk', 'Beverages', 40],
    ],
  },
  {
    store_name: 'Campus General Store', store_type: 'General Store', location: 'Shopping Complex, Shop 1',
    opens_at: '09:00', closes_at: '21:30',
    items: [
      ['Bathing Soap', 'Toiletries', 45], ['Shampoo (180 ml)', 'Toiletries', 160], ['Toothpaste', 'Toiletries', 95],
      ['Detergent (1 kg)', 'Household', 130], ['Mosquito Repellent', 'Household', 85], ['Instant Noodles (Pack of 4)', 'Groceries', 60],
      ['Biscuits', 'Groceries', 30], ['Mineral Water (1 L)', 'Groceries', 20], ['Extension Board', 'Electronics', 350],
      ['Phone Charger', 'Electronics', 450, false], ['Umbrella', 'Household', 300],
    ],
  },
  {
    store_name: 'Stationery & Print Hub', store_type: 'Stationery', location: 'Library Building, Ground Floor',
    opens_at: '08:30', closes_at: '20:00',
    items: [
      ['A4 Notebook (200 pages)', 'Stationery', 70], ['Ball Pen (Pack of 5)', 'Stationery', 50], ['Lab Record Book', 'Stationery', 90],
      ['Scientific Calculator', 'Instruments', 950], ['Engineering Graphics Kit', 'Instruments', 420],
      ['B/W Printout (per page)', 'Printing', 2], ['Colour Printout (per page)', 'Printing', 10], ['Spiral Binding', 'Printing', 40],
      ['Highlighter Set', 'Stationery', 80],
    ],
  },
];

export type CalendarSeed = [title: string, type: 'HOLIDAY' | 'EVENT' | 'EXAM', start: string, end: string | null, description: string];

/** Academic year 2026-27 (all times IST). */
export const CALENDAR: CalendarSeed[] = [
  // ---- Holidays
  ['Independence Day', 'HOLIDAY', '2026-08-15T00:00', '2026-08-15T23:59', 'National holiday. Flag hoisting at the Main Building at 08:00.'],
  ['Ganesh Chaturthi', 'HOLIDAY', '2026-09-14T00:00', '2026-09-14T23:59', 'Institute holiday.'],
  ['Gandhi Jayanti', 'HOLIDAY', '2026-10-02T00:00', '2026-10-02T23:59', 'National holiday.'],
  ['Dussehra Break', 'HOLIDAY', '2026-10-19T00:00', '2026-10-21T23:59', 'Mid-semester break. Mess will run a reduced menu.'],
  ['Diwali', 'HOLIDAY', '2026-11-08T00:00', '2026-11-09T23:59', 'Institute holiday. Hostel lights competition on the eve.'],
  ['Guru Nanak Jayanti', 'HOLIDAY', '2026-11-24T00:00', '2026-11-24T23:59', 'Institute holiday.'],
  ['Christmas', 'HOLIDAY', '2026-12-25T00:00', '2026-12-25T23:59', 'Winter vacation.'],
  ['Winter Vacation', 'HOLIDAY', '2026-12-19T00:00', '2027-01-04T23:59', 'Hostels remain open; outpasses required for travel.'],
  ['Sankranti', 'HOLIDAY', '2027-01-14T00:00', '2027-01-15T23:59', 'Institute holiday.'],
  ['Republic Day', 'HOLIDAY', '2027-01-26T00:00', '2027-01-26T23:59', 'National holiday.'],
  ['Holi', 'HOLIDAY', '2027-03-22T00:00', '2027-03-22T23:59', 'Institute holiday.'],
  ['Ugadi', 'HOLIDAY', '2027-04-07T00:00', '2027-04-07T23:59', 'Institute holiday.'],
  // ---- Events
  ['Freshers Orientation', 'EVENT', '2026-08-03T09:00', '2026-08-05T17:00', 'Orientation programme for the 2026 batch at the Auditorium.'],
  ['Hostel Room Allocation Window', 'EVENT', '2026-07-28T09:00', '2026-08-02T18:00', 'Room allocation and transfers for Semester I.'],
  ['Club Fair', 'EVENT', '2026-08-22T16:00', '2026-08-22T21:00', 'All student clubs and departments set up stalls at the SAC lawns.'],
  ['Inter-hostel Cricket Tournament', 'EVENT', '2026-09-05T07:00', '2026-09-13T18:00', 'League matches between the six hostels at the main ground.'],
  ['Technical Fest', 'EVENT', '2026-10-30T09:00', '2026-11-01T23:00', 'Three-day technical festival: hackathon, robotics and talks.'],
  ['Hostel Night - Krishna', 'EVENT', '2026-11-14T19:00', '2026-11-14T23:30', 'Annual hostel night with dinner and cultural programme.'],
  ['DBMS Project Demonstrations', 'EVENT', '2026-11-17T14:00', '2026-11-19T17:00', 'Final in-lab demonstrations and viva for the DBMS course project.'],
  ['Inter-hostel Sports Finals', 'EVENT', '2026-11-21T08:00', '2026-11-21T19:00', 'Finals of football, basketball and volleyball.'],
  ['Blood Donation Camp', 'EVENT', '2026-11-26T09:00', '2026-11-26T16:00', 'Organised with the district blood bank at the Medical Centre.'],
  ['Last Day of Instruction (Sem I)', 'EVENT', '2026-11-28T08:00', '2026-11-28T18:00', 'Classes end for Semester I.'],
  ['Career Fair', 'EVENT', '2027-01-23T10:00', '2027-01-23T17:00', 'Internship and placement fair at the Auditorium foyer.'],
  ['Cultural Fest', 'EVENT', '2027-02-12T17:00', '2027-02-14T23:30', 'Annual cultural festival: concerts, dance and drama.'],
  ['Alumni Meet', 'EVENT', '2027-03-06T10:00', '2027-03-06T20:00', 'Annual alumni reunion and networking dinner.'],
  ['Sports Fest', 'EVENT', '2027-03-26T07:00', '2027-03-28T20:00', 'Inter-collegiate sports festival.'],
  // ---- Exams
  ['Mid-Semester Examinations (Sem I)', 'EXAM', '2026-10-05T09:00', '2026-10-10T17:00', 'Mid-semester tests for all first-semester courses.'],
  ['CS F212 DBMS - Comprehensive Exam', 'EXAM', '2026-12-03T09:00', '2026-12-03T12:00', 'Database Systems comprehensive examination, F-block.'],
  ['Comprehensive Examinations (Sem I)', 'EXAM', '2026-12-02T09:00', '2026-12-16T17:00', 'End-semester comprehensive examinations.'],
  ['MATH F211 - Comprehensive Exam', 'EXAM', '2026-12-05T14:00', '2026-12-05T17:00', 'Mathematics III comprehensive examination.'],
  ['CS F213 OOP - Comprehensive Exam', 'EXAM', '2026-12-08T09:00', '2026-12-08T12:00', 'Object-Oriented Programming comprehensive examination.'],
  ['Mid-Semester Examinations (Sem II)', 'EXAM', '2027-03-08T09:00', '2027-03-13T17:00', 'Mid-semester tests for second-semester courses.'],
  ['Comprehensive Examinations (Sem II)', 'EXAM', '2027-05-03T09:00', '2027-05-17T17:00', 'End-semester comprehensive examinations.'],
];

export const OUTPASS_REASONS = [
  'Going home for the weekend',
  'Family function in Hyderabad',
  'Medical appointment at city hospital',
  'Attending a hackathon in the city',
  'Visiting relatives',
  'Internship interview at company office',
  'Festival at home',
  'Passport verification appointment',
  'Shopping for project components',
  'Inter-college sports event',
  'Dental appointment',
  'Conference presentation',
];

export const DOC_TYPES = [
  'ID Proof', 'Fee Receipt', 'Medical Certificate', 'Hostel Undertaking', 'Bonafide Request', 'Other',
] as const;

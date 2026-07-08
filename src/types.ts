export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'guest' | 'admin';
  phone?: string;
  identification?: string;
  isTemporary?: boolean;
  authProvider?: 'anonymous' | 'password' | 'google' | 'unknown';
}

export interface GuestContact {
  fullName: string;
  phone: string;
  identification: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  capacity: number;
  pricePerNight: number;
  images: string[];
  airbnb_ical_url: string;
  booking_ical_url: string;
  blockedDates: string[]; // Formato YYYY-MM-DD
}

import type { Timestamp } from 'firebase/firestore';

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  userStatus?: 'temporary' | 'registered';
  guestContact: GuestContact;
  checkIn: string; // Formato YYYY-MM-DD
  checkOut: string; // Formato YYYY-MM-DD
  status: 'confirmed' | 'cancelled';
  totalPrice: number;
  createdAt: string | Timestamp;
}

export interface NotificationConfig {
  emailEnabled: boolean;
  emailDestination: string;
  whatsappEnabled: boolean;
  whatsappDestination: string;
  smsEnabled: boolean;
  smsDestination: string;
}

export interface Settings {
  hotelLogoUrl: string;
  notificationConfig: NotificationConfig;
}

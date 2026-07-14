export type CalendarAppointment = {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: string;
  notes: string | null;
  barberId: string;
  serviceId: string;
  client: { id: string; name: string; phone: string; email: string | null };
  barber: { id: string; name: string; color: string };
  service: { id: string; name: string; duration: number; color: string };
};

export type CalendarBarber = {
  id: string;
  name: string;
  color: string;
  photoUrl: string | null;
};

export type CalendarService = {
  id: string;
  name: string;
  duration: number;
  price: number;
  color: string;
};

export type UserRole = "boss" | "employee";
export type ServicePlan = "weekly" | "biweekly" | "monthly" | "one_time";
export type InvoiceStatus = "unpaid" | "paid" | "overdue";
export type RecurrenceType = "one_time" | "weekly" | "biweekly" | "custom";
export type TimeOffStatus = "pending" | "approved" | "denied";
export type JobStatus = "scheduled" | "in_progress" | "done" | "skipped";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  /** The address they sign in with. */
  email?: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  plan: ServicePlan;
  price: number | null;
  last_service_date: string | null;
  notes: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp: string | null;
  contract_file_url: string | null;
  square_customer_id?: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  customer_id: string;
  description: string;
  amount: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  recurrence: RecurrenceType;
  created_by: string | null;
  square_invoice_id?: string | null;
  square_payment_id?: string | null;
  created_at: string;
  customers?: { name: string } | null;
}

export interface CrewShift {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  note: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface ScheduledJob {
  id: string;
  customer_id: string;
  employee_id: string | null;
  job_date: string;
  job_time?: string | null;
  service?: string | null;
  yard_id?: string | null;
  price?: number | null;
  square_invoice_id?: string | null;
  billed_at?: string | null;
  payment_status?: "pending" | "paid" | "failed" | null;
  recurrence: RecurrenceType;
  status: JobStatus;
  note: string | null;
  created_at: string;
  customers?: { name: string; address: string | null; plan: ServicePlan } | null;
  yards?: { name: string; address?: string | null } | null;
  profiles?: { full_name: string } | null;
}

export interface TimeClockEntry {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface JobTimerEntry {
  id: string;
  employee_id: string;
  job_name: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface TimeOffRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  /** null on both = all day; otherwise a window on that date */
  start_time?: string | null;
  end_time?: string | null;
  reason: string | null;
  status: TimeOffStatus;
  reviewed_by: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface Todo {
  id: string;
  employee_id: string | null;
  text: string;
  done: boolean;
  created_by: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface Receipt {
  id: string;
  uploaded_by: string;
  file_path: string;
  note: string | null;
  amount: number | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

/** A job as the crew sees it — customer name/address without the rest. */
export interface JobBoardRow {
  id: string;
  customer_id: string;
  employee_id: string | null;
  job_date: string;
  job_time: string | null;
  service: string | null;
  status: JobStatus;
  note: string | null;
  recurrence: RecurrenceType;
  customer_name: string | null;
  customer_address: string | null;
  yard_name?: string | null;
  gate_code?: string | null;
  client_name?: string | null;
  assigned_to: string | null;
}

/** A card charge taken through Square — successful or not. */
export interface PaymentAttempt {
  id: string;
  invoice_id: string | null;
  customer_id: string | null;
  charged_by: string | null;
  amount: number;
  card_last4: string | null;
  status: "completed" | "failed";
  square_payment_id: string | null;
  error: string | null;
  created_at: string;
}

/** A property that gets mowed. A client can have several. */
export interface Yard {
  id: string;
  customer_id: string;
  name: string;
  address: string | null;
  plan: ServicePlan;
  price: number | null;
  last_service_date: string | null;
  notes: string | null;
  gate_code: string | null;
  is_active: boolean;
  created_at: string;
  customers?: { name: string; phone: string | null; card_last4: string | null } | null;
}

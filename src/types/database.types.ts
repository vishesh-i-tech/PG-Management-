export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GenderType = "boys" | "girls" | "coed";
export type MemberRole = "owner" | "warden" | "tenant";
export type MemberStatus = "active" | "inactive" | "alumni";
export type RoomType = "single" | "double" | "triple" | "four_sharing" | "dormitory";
export type RoomStatus = "available" | "maintenance" | "full";
export type BedStatus = "vacant" | "occupied" | "reserved" | "maintenance";
export type TenantStatus = "active" | "notice_period" | "vacated" | "blacklisted";
export type SecurityDepositStatus = "pending" | "paid" | "partially_refunded" | "refunded" | "forfeited";
export type IdProofType = "college_id" | "work_id" | "driving_license" | "passport" | "voter_id" | "masked_aadhaar" | "other";
export type RentRecordStatus = "pending" | "partially_paid" | "paid" | "overdue" | "waived";
export type RentAdjustmentType = "waiver" | "discount" | "late_fee_addition" | "utility_meter" | "damage_penalty" | "correction";
export type PaymentOrderStatus = "created" | "attempted" | "paid" | "expired" | "failed";
export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cash" | "bank_transfer";
export type PaymentStatus = "pending" | "successful" | "failed" | "refunded";
export type AllocationType = "payment" | "reversal";
export type PaymentRefundStatus = "pending" | "processed" | "failed";
export type WebhookProcessingStatus = "pending" | "processed" | "failed" | "ignored";
export type ComplaintCategory = "plumbing" | "electrical" | "carpentry" | "cleaning" | "wifi" | "food" | "noise_disturbance" | "security" | "other";
export type ComplaintPriority = "low" | "medium" | "high" | "urgent";
export type ComplaintStatus = "open" | "in_progress" | "resolved" | "closed" | "rejected";
export type ExpenseCategory = "groceries_food" | "electricity_bill" | "water_bill" | "wifi_internet" | "staff_salary" | "property_rent" | "repairs_maintenance" | "cleaning_supplies" | "marketing" | "taxes" | "other";
export type ExpensePaymentMode = "cash" | "upi" | "bank_transfer" | "credit_card" | "cheque";
export type GateEventType = "check_out" | "check_in" | "late_check_in";
export type NightOutStatus = "pending" | "approved" | "rejected" | "completed" | "canceled";
export type GateState = "inside" | "outside" | "night_out";
export type InquirySource = "whatsapp_inquiry" | "website" | "walk_in" | "referral" | "portal";
export type InquiryStatus = "new" | "contacted" | "visit_scheduled" | "converted" | "dropped";
export type FollowUpChannel = "phone_call" | "whatsapp" | "in_person" | "email";
export type MealType = "breakfast" | "lunch" | "evening_snacks" | "dinner";
export type NotificationChannel = "whatsapp" | "sms";
export type NotificationStatus = "queued" | "processing" | "sent" | "delivered" | "failed" | "dead_letter";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          phone: string;
          full_name: string;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone: string;
          full_name: string;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          full_name?: string;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pgs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          pincode: string;
          contact_phone: string;
          contact_email: string | null;
          gender_type: GenderType;
          gate_closing_time: string;
          gstin: string | null;
          pan_number: string | null;
          rules_and_regulations: string | null;
          bank_upi_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          pincode: string;
          contact_phone: string;
          contact_email?: string | null;
          gender_type: GenderType;
          gate_closing_time?: string;
          gstin?: string | null;
          pan_number?: string | null;
          rules_and_regulations?: string | null;
          bank_upi_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state?: string;
          pincode?: string;
          contact_phone?: string;
          contact_email?: string | null;
          gender_type?: GenderType;
          gate_closing_time?: string;
          gstin?: string | null;
          pan_number?: string | null;
          rules_and_regulations?: string | null;
          bank_upi_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pg_members: {
        Row: {
          id: string;
          pg_id: string;
          user_id: string;
          role: MemberRole;
          status: MemberStatus;
          permissions: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          user_id: string;
          role: MemberRole;
          status?: MemberStatus;
          permissions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          user_id?: string;
          role?: MemberRole;
          status?: MemberStatus;
          permissions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          pg_id: string;
          room_number: string;
          floor_number: number;
          room_type: RoomType;
          has_attached_bathroom: boolean;
          has_ac: boolean;
          has_balcony: boolean;
          base_monthly_rent: number;
          status: RoomStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          room_number: string;
          floor_number?: number;
          room_type: RoomType;
          has_attached_bathroom?: boolean;
          has_ac?: boolean;
          has_balcony?: boolean;
          base_monthly_rent: number;
          status?: RoomStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          room_number?: string;
          floor_number?: number;
          room_type?: RoomType;
          has_attached_bathroom?: boolean;
          has_ac?: boolean;
          has_balcony?: boolean;
          base_monthly_rent?: number;
          status?: RoomStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      beds: {
        Row: {
          id: string;
          pg_id: string;
          room_id: string;
          bed_label: string;
          monthly_rent: number;
          status: BedStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          room_id: string;
          bed_label: string;
          monthly_rent: number;
          status?: BedStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          room_id?: string;
          bed_label?: string;
          monthly_rent?: number;
          status?: BedStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          pg_id: string;
          user_id: string | null;
          full_name: string;
          phone: string;
          email: string | null;
          permanent_address: string | null;
          emergency_contact_name: string;
          emergency_contact_phone: string;
          emergency_contact_relation: string;
          employer_or_college: string | null;
          security_deposit_amount: number;
          security_deposit_status: SecurityDepositStatus;
          whatsapp_opt_out: boolean;
          status: TenantStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          user_id?: string | null;
          full_name: string;
          phone: string;
          email?: string | null;
          permanent_address?: string | null;
          emergency_contact_name: string;
          emergency_contact_phone: string;
          emergency_contact_relation: string;
          employer_or_college?: string | null;
          security_deposit_amount?: number;
          security_deposit_status?: SecurityDepositStatus;
          whatsapp_opt_out?: boolean;
          status?: TenantStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          user_id?: string | null;
          full_name?: string;
          phone?: string;
          email?: string | null;
          permanent_address?: string | null;
          emergency_contact_name?: string;
          emergency_contact_phone?: string;
          emergency_contact_relation?: string;
          employer_or_college?: string | null;
          security_deposit_amount?: number;
          security_deposit_status?: SecurityDepositStatus;
          whatsapp_opt_out?: boolean;
          status?: TenantStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_sensitive_kyc: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          id_proof_type: IdProofType;
          id_proof_last_four: string;
          document_storage_path: string;
          verified_by_user_id: string | null;
          verified_at: string | null;
          legal_hold: boolean;
          purge_scheduled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          id_proof_type: IdProofType;
          id_proof_last_four: string;
          document_storage_path: string;
          verified_by_user_id?: string | null;
          verified_at?: string | null;
          legal_hold?: boolean;
          purge_scheduled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          id_proof_type?: IdProofType;
          id_proof_last_four?: string;
          document_storage_path?: string;
          verified_by_user_id?: string | null;
          verified_at?: string | null;
          legal_hold?: boolean;
          purge_scheduled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_bed_assignments: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          bed_id: string;
          agreed_monthly_rent: number;
          assigned_from: string;
          assigned_to: string | null;
          stay_period: string;
          notice_given_date: string | null;
          vacating_date: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          bed_id: string;
          agreed_monthly_rent: number;
          assigned_from: string;
          assigned_to?: string | null;
          notice_given_date?: string | null;
          vacating_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          bed_id?: string;
          agreed_monthly_rent?: number;
          assigned_from?: string;
          assigned_to?: string | null;
          notice_given_date?: string | null;
          vacating_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rent_records: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          assignment_id: string;
          billing_month: string;
          period_start: string;
          period_end: string;
          due_date: string;
          base_rent_amount: number;
          utility_charges: number;
          late_fee_amount: number;
          discount_amount: number;
          total_due_amount: number;
          paid_amount: number;
          balance_amount: number;
          status: RentRecordStatus;
          generated_by: "system" | "manual";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          assignment_id: string;
          billing_month: string;
          period_start: string;
          period_end: string;
          due_date: string;
          base_rent_amount: number;
          utility_charges?: number;
          late_fee_amount?: number;
          discount_amount?: number;
          total_due_amount: number;
          paid_amount?: number;
          balance_amount: number;
          status?: RentRecordStatus;
          generated_by?: "system" | "manual";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          assignment_id?: string;
          billing_month?: string;
          period_start?: string;
          period_end?: string;
          due_date?: string;
          base_rent_amount?: number;
          utility_charges?: number;
          late_fee_amount?: number;
          discount_amount?: number;
          total_due_amount?: number;
          paid_amount?: number;
          balance_amount?: number;
          status?: RentRecordStatus;
          generated_by?: "system" | "manual";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rent_adjustments: {
        Row: {
          id: string;
          pg_id: string;
          rent_record_id: string;
          adjustment_type: RentAdjustmentType;
          amount: number;
          reason: string;
          authorized_by_user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          rent_record_id: string;
          adjustment_type: RentAdjustmentType;
          amount: number;
          reason: string;
          authorized_by_user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          rent_record_id?: string;
          adjustment_type?: RentAdjustmentType;
          amount?: number;
          reason?: string;
          authorized_by_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      payment_orders: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          target_rent_record_id: string;
          razorpay_order_id: string;
          expected_amount: number;
          currency: string;
          status: PaymentOrderStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          target_rent_record_id: string;
          razorpay_order_id: string;
          expected_amount: number;
          currency?: string;
          status?: PaymentOrderStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          target_rent_record_id?: string;
          razorpay_order_id?: string;
          expected_amount?: number;
          currency?: string;
          status?: PaymentOrderStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          amount: number;
          payment_method: PaymentMethod;
          payment_status: PaymentStatus;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_signature: string | null;
          receipt_number: string;
          receipt_pdf_path: string | null;
          recorded_by_user_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          amount: number;
          payment_method: PaymentMethod;
          payment_status?: PaymentStatus;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          receipt_number: string;
          receipt_pdf_path?: string | null;
          recorded_by_user_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          amount?: number;
          payment_method?: PaymentMethod;
          payment_status?: PaymentStatus;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          receipt_number?: string;
          receipt_pdf_path?: string | null;
          recorded_by_user_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_allocations: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          payment_id: string;
          rent_record_id: string;
          allocated_amount: number;
          allocation_type: AllocationType;
          allocated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          payment_id: string;
          rent_record_id: string;
          allocated_amount: number;
          allocation_type?: AllocationType;
          allocated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          payment_id?: string;
          rent_record_id?: string;
          allocated_amount?: number;
          allocation_type?: AllocationType;
          allocated_at?: string;
        };
        Relationships: [];
      };
      payment_refunds: {
        Row: {
          id: string;
          pg_id: string;
          payment_id: string;
          razorpay_refund_id: string | null;
          amount: number;
          reason: string;
          status: PaymentRefundStatus;
          initiated_by_user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          payment_id: string;
          razorpay_refund_id?: string | null;
          amount: number;
          reason: string;
          status?: PaymentRefundStatus;
          initiated_by_user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          payment_id?: string;
          razorpay_refund_id?: string | null;
          amount?: number;
          reason?: string;
          status?: PaymentRefundStatus;
          initiated_by_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          event_type: string;
          payload: Json;
          signature: string;
          processing_status: WebhookProcessingStatus;
          error_message: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider?: string;
          event_id: string;
          event_type: string;
          payload: Json;
          signature: string;
          processing_status?: WebhookProcessingStatus;
          error_message?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          event_id?: string;
          event_type?: string;
          payload?: Json;
          signature?: string;
          processing_status?: WebhookProcessingStatus;
          error_message?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      complaints: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          room_id: string | null;
          category: ComplaintCategory;
          title: string;
          description: string;
          photo_storage_paths: string[];
          priority: ComplaintPriority;
          status: ComplaintStatus;
          assigned_to_user_id: string | null;
          resolution_notes: string | null;
          resolved_at: string | null;
          tenant_feedback_rating: number | null;
          tenant_feedback_comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          room_id?: string | null;
          category: ComplaintCategory;
          title: string;
          description: string;
          photo_storage_paths?: string[];
          priority?: ComplaintPriority;
          status?: ComplaintStatus;
          assigned_to_user_id?: string | null;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          tenant_feedback_rating?: number | null;
          tenant_feedback_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          room_id?: string | null;
          category?: ComplaintCategory;
          title?: string;
          description?: string;
          photo_storage_paths?: string[];
          priority?: ComplaintPriority;
          status?: ComplaintStatus;
          assigned_to_user_id?: string | null;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          tenant_feedback_rating?: number | null;
          tenant_feedback_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      complaint_status_history: {
        Row: {
          id: string;
          pg_id: string;
          complaint_id: string;
          from_status: string | null;
          to_status: string;
          changed_by_user_id: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          complaint_id: string;
          from_status?: string | null;
          to_status: string;
          changed_by_user_id: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          complaint_id?: string;
          from_status?: string | null;
          to_status?: string;
          changed_by_user_id?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          pg_id: string;
          category: ExpenseCategory;
          title: string;
          amount: number;
          expense_date: string;
          payment_mode: ExpensePaymentMode;
          receipt_storage_path: string | null;
          vendor_name: string | null;
          recorded_by_user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          category: ExpenseCategory;
          title: string;
          amount: number;
          expense_date: string;
          payment_mode: ExpensePaymentMode;
          receipt_storage_path?: string | null;
          vendor_name?: string | null;
          recorded_by_user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          category?: ExpenseCategory;
          title?: string;
          amount?: number;
          expense_date?: string;
          payment_mode?: ExpensePaymentMode;
          receipt_storage_path?: string | null;
          vendor_name?: string | null;
          recorded_by_user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      gate_events: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          event_type: GateEventType;
          logged_at: string;
          is_late: boolean;
          verified_by_user_id: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          event_type: GateEventType;
          logged_at?: string;
          is_late?: boolean;
          verified_by_user_id?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          event_type?: GateEventType;
          logged_at?: string;
          is_late?: boolean;
          verified_by_user_id?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      night_out_requests: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          departure_date: string;
          expected_return_date: string;
          reason: string;
          status: NightOutStatus;
          approved_by_user_id: string | null;
          parent_consent_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          departure_date: string;
          expected_return_date: string;
          reason: string;
          status?: NightOutStatus;
          approved_by_user_id?: string | null;
          parent_consent_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          departure_date?: string;
          expected_return_date?: string;
          reason?: string;
          status?: NightOutStatus;
          approved_by_user_id?: string | null;
          parent_consent_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_gate_states: {
        Row: {
          pg_id: string;
          tenant_id: string;
          current_state: GateState;
          last_event_at: string;
          last_event_type: string;
          active_night_out_id: string | null;
          updated_at: string;
        };
        Insert: {
          pg_id: string;
          tenant_id: string;
          current_state?: GateState;
          last_event_at?: string;
          last_event_type: string;
          active_night_out_id?: string | null;
          updated_at?: string;
        };
        Update: {
          pg_id?: string;
          tenant_id?: string;
          current_state?: GateState;
          last_event_at?: string;
          last_event_type?: string;
          active_night_out_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiries: {
        Row: {
          id: string;
          pg_id: string;
          prospect_name: string;
          phone: string;
          email: string | null;
          desired_room_type: RoomType | null;
          expected_joining_date: string | null;
          budget: number | null;
          source: InquirySource;
          status: InquiryStatus;
          notes: string | null;
          converted_tenant_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          prospect_name: string;
          phone: string;
          email?: string | null;
          desired_room_type?: RoomType | null;
          expected_joining_date?: string | null;
          budget?: number | null;
          source?: InquirySource;
          status?: InquiryStatus;
          notes?: string | null;
          converted_tenant_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          prospect_name?: string;
          phone?: string;
          email?: string | null;
          desired_room_type?: RoomType | null;
          expected_joining_date?: string | null;
          budget?: number | null;
          source?: InquirySource;
          status?: InquiryStatus;
          notes?: string | null;
          converted_tenant_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiry_follow_ups: {
        Row: {
          id: string;
          pg_id: string;
          inquiry_id: string;
          contacted_by_user_id: string;
          follow_up_channel: FollowUpChannel;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          inquiry_id: string;
          contacted_by_user_id: string;
          follow_up_channel: FollowUpChannel;
          notes: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          inquiry_id?: string;
          contacted_by_user_id?: string;
          follow_up_channel?: FollowUpChannel;
          notes?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      mess_menu: {
        Row: {
          id: string;
          pg_id: string;
          day_of_week: number;
          meal_type: MealType;
          menu_items: string;
          start_time: string;
          end_time: string;
          special_notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          day_of_week: number;
          meal_type: MealType;
          menu_items: string;
          start_time: string;
          end_time: string;
          special_notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          day_of_week?: number;
          meal_type?: MealType;
          menu_items?: string;
          start_time?: string;
          end_time?: string;
          special_notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_jobs: {
        Row: {
          id: string;
          pg_id: string;
          channel: NotificationChannel;
          recipient_phone: string;
          template_name: string;
          template_variables: Json;
          idempotency_key: string;
          status: NotificationStatus;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string;
          provider_message_id: string | null;
          last_error: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          channel?: NotificationChannel;
          recipient_phone: string;
          template_name: string;
          template_variables?: Json;
          idempotency_key: string;
          status?: NotificationStatus;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          provider_message_id?: string | null;
          last_error?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          channel?: NotificationChannel;
          recipient_phone?: string;
          template_name?: string;
          template_variables?: Json;
          idempotency_key?: string;
          status?: NotificationStatus;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          provider_message_id?: string | null;
          last_error?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_invitations: {
        Row: {
          id: string;
          pg_id: string;
          tenant_id: string;
          phone: string;
          token_hash: string;
          expires_at: string;
          status: InvitationStatus;
          accepted_by_user_id: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          tenant_id: string;
          phone: string;
          token_hash: string;
          expires_at: string;
          status?: InvitationStatus;
          accepted_by_user_id?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          tenant_id?: string;
          phone?: string;
          token_hash?: string;
          expires_at?: string;
          status?: InvitationStatus;
          accepted_by_user_id?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      staff_invitations: {
        Row: {
          id: string;
          pg_id: string;
          email_or_phone: string;
          designated_role: "warden" | "owner";
          token_hash: string;
          expires_at: string;
          invited_by_user_id: string;
          status: InvitationStatus;
          accepted_by_user_id: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pg_id: string;
          email_or_phone: string;
          designated_role: "warden" | "owner";
          token_hash: string;
          expires_at: string;
          invited_by_user_id: string;
          status?: InvitationStatus;
          accepted_by_user_id?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string;
          email_or_phone?: string;
          designated_role?: "warden" | "owner";
          token_hash?: string;
          expires_at?: string;
          invited_by_user_id?: string;
          status?: InvitationStatus;
          accepted_by_user_id?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          pg_id: string | null;
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pg_id?: string | null;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pg_id?: string | null;
          actor_user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          details?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_new_pg_business: {
        Args: {
          p_name: string;
          p_slug: string;
          p_address_line1: string;
          p_address_line2?: string | null;
          p_city: string;
          p_state: string;
          p_pincode: string;
          p_contact_phone: string;
          p_gender_type: string;
        };
        Returns: string;
      };
      reconcile_payment_transaction: {
        Args: {
          p_event_id: string | null;
          p_razorpay_order_id: string;
          p_razorpay_payment_id: string;
          p_payment_method: string;
          p_captured_amount: number;
          p_signature?: string | null;
        };
        Returns: Json;
      };
      process_payment_refund: {
        Args: {
          p_payment_id: string;
          p_refund_amount: number;
          p_razorpay_refund_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      reconcile_rent_record_ledger: {
        Args: {
          p_rent_record_id: string;
        };
        Returns: Json;
      };
      accept_tenant_invitation: {
        Args: {
          p_plaintext_token: string;
        };
        Returns: Json;
      };
      accept_staff_invitation: {
        Args: {
          p_plaintext_token: string;
        };
        Returns: Json;
      };
      claim_notification_jobs: {
        Args: {
          p_batch_size?: number;
        };
        Returns: Database["public"]["Tables"]["notification_jobs"]["Row"][];
      };
      recover_stuck_notification_jobs: {
        Args: Record<string, never>;
        Returns: number;
      };
      record_gate_movement: {
        Args: {
          p_pg_id: string;
          p_tenant_id: string;
          p_event_type: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      get_tenants_outside_for_gate_alert: {
        Args: {
          p_target_time?: string;
        };
        Returns: {
          pg_id: string;
          tenant_id: string;
          tenant_name: string;
          phone: string;
          gate_closing_time: string;
        }[];
      };
      get_auth_user_role: {
        Args: {
          target_pg_id: string;
        };
        Returns: string | null;
      };
      get_auth_active_tenant_id: {
        Args: {
          target_pg_id: string;
        };
        Returns: string | null;
      };
      get_auth_any_tenant_id: {
        Args: {
          target_pg_id: string;
        };
        Returns: string | null;
      };
    };
  };
}

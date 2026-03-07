
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.app_role AS ENUM ('applicant', 'operator', 'onboarding_staff', 'dispatcher', 'management');
CREATE TYPE public.account_status AS ENUM ('pending', 'active', 'denied', 'inactive');
CREATE TYPE public.review_status AS ENUM ('pending', 'approved', 'denied');
CREATE TYPE public.mvr_status AS ENUM ('not_started', 'requested', 'received');
CREATE TYPE public.document_status AS ENUM ('not_started', 'requested', 'received');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'denied');
CREATE TYPE public.screening_status AS ENUM ('not_started', 'scheduled', 'results_in');
CREATE TYPE public.screening_result AS ENUM ('pending', 'clear', 'non_clear');
CREATE TYPE public.registration_type AS ENUM ('own_registration', 'needs_mo_reg');
CREATE TYPE public.ica_status AS ENUM ('not_issued', 'sent_for_signature', 'complete');
CREATE TYPE public.mo_docs_status AS ENUM ('not_submitted', 'submitted');
CREATE TYPE public.mo_reg_status AS ENUM ('not_yet', 'yes');
CREATE TYPE public.install_method AS ENUM ('ar_shop_install', 'ups_self_install');
CREATE TYPE public.yes_no AS ENUM ('no', 'yes');
CREATE TYPE public.dispatch_status AS ENUM ('not_dispatched', 'dispatched', 'home', 'truck_down');
CREATE TYPE public.doc_review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.notification_channel AS ENUM ('in_app', 'email', 'both');
CREATE TYPE public.pandadoc_status AS ENUM ('sent', 'viewed', 'completed');
CREATE TYPE public.resource_category AS ENUM ('user_manuals', 'decal_files', 'forms_compliance', 'dot_general');
CREATE TYPE public.operator_doc_type AS ENUM ('registration', 'insurance_cert', 'inspection_report', 'ica_summary', 'other');
CREATE TYPE public.faq_category AS ENUM ('application_process', 'background_screening', 'documents_requirements', 'ica_contracts', 'missouri_registration', 'equipment', 'dispatch_operations', 'general_owner_operator');

-- =============================================
-- PROFILES TABLE (extends auth.users)
-- =============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  home_state TEXT,
  invited_by UUID REFERENCES auth.users(id),
  account_status public.account_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- USER ROLES TABLE (separate from profiles)
-- =============================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get all roles for a user
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS public.app_role[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(role) FROM public.user_roles WHERE user_id = _user_id
$$;

-- Function to check if user is internal staff
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('onboarding_staff', 'dispatcher', 'management')
  )
$$;

-- =============================================
-- APPLICATIONS TABLE
-- =============================================
CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id),
  review_status public.review_status NOT NULL DEFAULT 'pending',
  reviewer_notes TEXT,
  first_name TEXT,
  last_name TEXT,
  dob DATE,
  phone TEXT,
  email TEXT NOT NULL,
  address_street TEXT,
  address_line2 TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_duration TEXT,
  prev_address_street TEXT,
  prev_address_line2 TEXT,
  prev_address_city TEXT,
  prev_address_state TEXT,
  prev_address_zip TEXT,
  cdl_state TEXT,
  cdl_number TEXT,
  cdl_class TEXT,
  cdl_expiration DATE,
  endorsements TEXT[],
  cdl_10_years BOOLEAN,
  referral_source TEXT,
  employer_1 JSONB,
  employer_2 JSONB,
  employer_3 JSONB,
  employer_4 JSONB,
  additional_employers TEXT,
  employment_gaps BOOLEAN,
  employment_gaps_explanation TEXT,
  years_experience TEXT,
  equipment_operated TEXT[],
  dot_accidents BOOLEAN,
  dot_accidents_description TEXT,
  moving_violations BOOLEAN,
  moving_violations_description TEXT,
  sap_process BOOLEAN,
  dl_front_url TEXT,
  dl_rear_url TEXT,
  medical_cert_url TEXT,
  auth_safety_history BOOLEAN DEFAULT FALSE,
  auth_drug_alcohol BOOLEAN DEFAULT FALSE,
  auth_previous_employers BOOLEAN DEFAULT FALSE,
  dot_positive_test_past_2yr BOOLEAN,
  dot_return_to_duty_docs BOOLEAN,
  testing_policy_accepted BOOLEAN DEFAULT FALSE,
  ssn_encrypted TEXT,
  typed_full_name TEXT,
  signature_image_url TEXT,
  signed_date DATE,
  is_draft BOOLEAN DEFAULT TRUE,
  draft_token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- OPERATORS TABLE
-- =============================================
CREATE TABLE public.operators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id),
  assigned_onboarding_staff UUID REFERENCES auth.users(id),
  unit_number TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ONBOARDING STATUS TABLE
-- =============================================
CREATE TABLE public.onboarding_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL UNIQUE REFERENCES public.operators(id) ON DELETE CASCADE,
  mvr_status public.mvr_status NOT NULL DEFAULT 'not_started',
  ch_status public.mvr_status NOT NULL DEFAULT 'not_started',
  mvr_ch_approval public.approval_status NOT NULL DEFAULT 'pending',
  pe_screening public.screening_status NOT NULL DEFAULT 'not_started',
  pe_screening_result public.screening_result NOT NULL DEFAULT 'pending',
  registration_status public.registration_type,
  form_2290 public.document_status NOT NULL DEFAULT 'not_started',
  truck_title public.document_status NOT NULL DEFAULT 'not_started',
  truck_photos public.document_status NOT NULL DEFAULT 'not_started',
  truck_inspection public.document_status NOT NULL DEFAULT 'not_started',
  ica_status public.ica_status NOT NULL DEFAULT 'not_issued',
  mo_docs_submitted public.mo_docs_status NOT NULL DEFAULT 'not_submitted',
  mo_expected_approval_date DATE,
  mo_reg_received public.mo_reg_status NOT NULL DEFAULT 'not_yet',
  decal_method public.install_method,
  decal_applied public.yes_no NOT NULL DEFAULT 'no',
  eld_method public.install_method,
  eld_installed public.yes_no NOT NULL DEFAULT 'no',
  fuel_card_issued public.yes_no NOT NULL DEFAULT 'no',
  insurance_added_date DATE,
  unit_number TEXT,
  fully_onboarded BOOLEAN GENERATED ALWAYS AS (insurance_added_date IS NOT NULL) STORED,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.onboarding_status ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ACTIVE DISPATCH TABLE
-- =============================================
CREATE TABLE public.active_dispatch (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL UNIQUE REFERENCES public.operators(id) ON DELETE CASCADE,
  dispatch_status public.dispatch_status NOT NULL DEFAULT 'not_dispatched',
  assigned_dispatcher UUID REFERENCES auth.users(id),
  current_load_lane TEXT,
  eta_redispatch TEXT,
  status_notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.active_dispatch ENABLE ROW LEVEL SECURITY;

-- =============================================
-- DOCUMENTS TABLE
-- =============================================
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_status public.doc_review_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- MESSAGES TABLE
-- =============================================
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE,
  channel public.notification_channel NOT NULL DEFAULT 'in_app'
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PANDADOC DOCUMENTS TABLE
-- =============================================
CREATE TABLE public.pandadoc_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  pandadoc_document_id TEXT,
  pandadoc_status public.pandadoc_status NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  signed_at TIMESTAMP WITH TIME ZONE,
  sent_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.pandadoc_documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RESOURCE DOCUMENTS TABLE
-- =============================================
CREATE TABLE public.resource_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category public.resource_category NOT NULL,
  file_url TEXT,
  file_name TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.resource_documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- OPERATOR DOCUMENTS TABLE
-- =============================================
CREATE TABLE public.operator_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  document_type public.operator_doc_type NOT NULL DEFAULT 'other',
  file_url TEXT,
  file_name TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- FAQ TABLE
-- =============================================
CREATE TABLE public.faq (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category public.faq_category NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.faq ENABLE ROW LEVEL SECURITY;

-- =============================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON public.operators FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_faq_updated_at BEFORE UPDATE ON public.faq FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- RLS POLICIES
-- =============================================

-- PROFILES
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Staff can view all profiles" ON public.profiles FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update profiles" ON public.profiles FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Allow insert on signup" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- USER_ROLES
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Management can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'management'));
CREATE POLICY "Management can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'management'));
CREATE POLICY "Management can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'management'));

-- APPLICATIONS
CREATE POLICY "Anyone can insert application" ON public.applications FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Owner can view own application" ON public.applications FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Owner can update draft application" ON public.applications FOR UPDATE USING (auth.uid() = user_id AND is_draft = TRUE);
CREATE POLICY "Staff can view all applications" ON public.applications FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update applications" ON public.applications FOR UPDATE USING (public.is_staff(auth.uid()));

-- OPERATORS
CREATE POLICY "Operators can view their own record" ON public.operators FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Staff can view all operators" ON public.operators FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert operators" ON public.operators FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update operators" ON public.operators FOR UPDATE USING (public.is_staff(auth.uid()));

-- ONBOARDING_STATUS
CREATE POLICY "Operators can view their own status" ON public.onboarding_status FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operators WHERE operators.id = onboarding_status.operator_id AND operators.user_id = auth.uid())
);
CREATE POLICY "Staff can view all onboarding status" ON public.onboarding_status FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert onboarding status" ON public.onboarding_status FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update onboarding status" ON public.onboarding_status FOR UPDATE USING (public.is_staff(auth.uid()));

-- ACTIVE_DISPATCH
CREATE POLICY "Operators can view their own dispatch" ON public.active_dispatch FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operators WHERE operators.id = active_dispatch.operator_id AND operators.user_id = auth.uid())
);
CREATE POLICY "Staff can view all dispatch" ON public.active_dispatch FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Dispatchers can update dispatch" ON public.active_dispatch FOR UPDATE USING (
  public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'management')
);
CREATE POLICY "Dispatchers can insert dispatch" ON public.active_dispatch FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'management')
);

-- DOCUMENTS
CREATE POLICY "Operators can view their own documents" ON public.documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operators WHERE operators.id = documents.operator_id AND operators.user_id = auth.uid())
);
CREATE POLICY "Operators can upload their own documents" ON public.documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.operators WHERE operators.id = documents.operator_id AND operators.user_id = auth.uid())
);
CREATE POLICY "Staff can view all documents" ON public.documents FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update documents" ON public.documents FOR UPDATE USING (public.is_staff(auth.uid()));

-- MESSAGES
CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Recipient can mark as read" ON public.messages FOR UPDATE USING (auth.uid() = recipient_id);

-- NOTIFICATIONS
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can mark own notifications read" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Staff can insert notifications" ON public.notifications FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- PANDADOC_DOCUMENTS
CREATE POLICY "Operators can view their own pandadoc docs" ON public.pandadoc_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operators WHERE operators.id = pandadoc_documents.operator_id AND operators.user_id = auth.uid())
);
CREATE POLICY "Staff can view all pandadoc docs" ON public.pandadoc_documents FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert pandadoc docs" ON public.pandadoc_documents FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update pandadoc docs" ON public.pandadoc_documents FOR UPDATE USING (public.is_staff(auth.uid()));

-- RESOURCE_DOCUMENTS
CREATE POLICY "Authenticated users can view visible resources" ON public.resource_documents FOR SELECT USING (auth.uid() IS NOT NULL AND is_visible = TRUE);
CREATE POLICY "Staff can view all resources" ON public.resource_documents FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage resources" ON public.resource_documents FOR ALL USING (public.is_staff(auth.uid()));

-- OPERATOR_DOCUMENTS
CREATE POLICY "Operators can view their own operator docs" ON public.operator_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.operators WHERE operators.id = operator_documents.operator_id AND operators.user_id = auth.uid())
);
CREATE POLICY "Staff can view all operator docs" ON public.operator_documents FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage operator docs" ON public.operator_documents FOR ALL USING (public.is_staff(auth.uid()));

-- FAQ
CREATE POLICY "Anyone can view published FAQs" ON public.faq FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Staff can view all FAQs" ON public.faq FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage FAQs" ON public.faq FOR ALL USING (public.is_staff(auth.uid()));

-- =============================================
-- STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('application-documents', 'application-documents', FALSE);
INSERT INTO storage.buckets (id, name, public) VALUES ('operator-documents', 'operator-documents', FALSE);
INSERT INTO storage.buckets (id, name, public) VALUES ('resource-library', 'resource-library', TRUE);
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', FALSE);

-- Storage policies
CREATE POLICY "Anyone can upload application documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'application-documents');
CREATE POLICY "Auth users can view application documents" ON storage.objects FOR SELECT USING (bucket_id = 'application-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "Staff can delete application documents" ON storage.objects FOR DELETE USING (bucket_id = 'application-documents' AND public.is_staff(auth.uid()));
CREATE POLICY "Operators can upload operator docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'operator-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "Operators can view their operator docs folder" ON storage.objects FOR SELECT USING (bucket_id = 'operator-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Staff can manage all operator documents" ON storage.objects FOR ALL USING (bucket_id = 'operator-documents' AND public.is_staff(auth.uid()));
CREATE POLICY "Public can view resource library" ON storage.objects FOR SELECT USING (bucket_id = 'resource-library');
CREATE POLICY "Staff can manage resource library" ON storage.objects FOR ALL USING (bucket_id = 'resource-library' AND public.is_staff(auth.uid()));
CREATE POLICY "Anyone can upload signature" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'signatures');
CREATE POLICY "Auth users can view signatures" ON storage.objects FOR SELECT USING (bucket_id = 'signatures' AND auth.uid() IS NOT NULL);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_applications_email ON public.applications(email);
CREATE INDEX idx_applications_review_status ON public.applications(review_status);
CREATE INDEX idx_operators_user_id ON public.operators(user_id);
CREATE INDEX idx_onboarding_operator_id ON public.onboarding_status(operator_id);
CREATE INDEX idx_active_dispatch_operator_id ON public.active_dispatch(operator_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient ON public.messages(recipient_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_faq_category ON public.faq(category);

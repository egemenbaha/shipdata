CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mmsi TEXT NOT NULL,
  vessel_name TEXT,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('DARK','COURSE_DEV','SPOOFING')),
  risk_score INTEGER NOT NULL DEFAULT 0,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  message TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_created_at ON public.alerts (created_at DESC);
CREATE INDEX idx_alerts_mmsi_type ON public.alerts (mmsi, alert_type);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read alerts"
  ON public.alerts FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert alerts"
  ON public.alerts FOR INSERT
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
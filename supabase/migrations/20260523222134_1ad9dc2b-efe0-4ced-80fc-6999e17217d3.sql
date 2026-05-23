
CREATE TABLE IF NOT EXISTS public.vessels (
  mmsi TEXT PRIMARY KEY,
  name TEXT,
  imo BIGINT,
  ship_type INTEGER,
  last_lat DOUBLE PRECISION,
  last_lon DOUBLE PRECISION,
  last_heading DOUBLE PRECISION,
  last_cog DOUBLE PRECISION,
  last_speed DOUBLE PRECISION,
  last_seen TIMESTAMPTZ,
  last_geom TEXT,
  status TEXT DEFAULT 'nominal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.positions (
  id BIGSERIAL PRIMARY KEY,
  mmsi TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  cog DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom TEXT
);

CREATE INDEX IF NOT EXISTS positions_mmsi_ts_idx ON public.positions (mmsi, ts DESC);
CREATE INDEX IF NOT EXISTS vessels_last_seen_idx ON public.vessels (last_seen DESC);

ALTER TABLE public.vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vessels" ON public.vessels FOR SELECT USING (true);
CREATE POLICY "Anyone can read positions" ON public.positions FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.vessels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;

export type Planet = {
  disposition: string;
  orbital_period_days: string;
  planet_radius_rearth: string;
  insolation_flux_eflux: string;
  equilibrium_temp_K: string;
  ra_deg: string;
  dec_deg: string;
  source: string;
  planet_name: string;
};

export type PlanetFeature = {
  label: string;
  value: string;
  maxValue: number;
};

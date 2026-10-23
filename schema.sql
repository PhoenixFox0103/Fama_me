-- FAMMA ME - MIGRATION COMPLETE VERS LE DERNIER SIGNALEMENT
-- Copier ce fichier EN ENTIER dans une nouvelle requete Supabase, puis cliquer Run.

begin;

alter table public.zones add column if not exists source text not null default 'seed';
alter table public.zones add column if not exists is_active boolean not null default true;
alter table public.zones add column if not exists created_at timestamptz not null default now();

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  zone_id uuid not null references public.zones(id) on delete cascade,
  status text not null check (status in ('water','cut','low')),
  device_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.reports add column if not exists created_at timestamptz;
do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='updated_at'
  ) then
    execute 'update public.reports set created_at = coalesce(created_at, updated_at, now()) where created_at is null';
  else
    update public.reports set created_at = now() where created_at is null;
  end if;
end;
$migration$;
alter table public.reports alter column created_at set default now();
alter table public.reports alter column created_at set not null;

-- L'ancien systeme imposait un vote unique par appareil et par zone.
-- On retire cette contrainte pour conserver chaque nouveau signalement dans l'historique.
alter table public.reports drop constraint if exists reports_zone_id_device_hash_key;
drop index if exists public.reports_zone_device_unique;
drop index if exists public.reports_zone_id_device_hash_key;
create index if not exists reports_zone_created_idx on public.reports(zone_id, created_at desc, id desc);

alter table public.reports enable row level security;

create table if not exists public.zone_add_log (
  id bigint generated always as identity primary key,
  device_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.zone_add_log enable row level security;
create index if not exists zone_add_log_lookup_idx on public.zone_add_log(device_hash, created_at desc);

drop function if exists public.submit_report(uuid,text,text);
create function public.submit_report(p_zone_id uuid, p_status text, p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hash text;
  v_last_time timestamptz;
begin
  if p_status not in ('water','cut','low') then
    raise exception 'Situation invalide';
  end if;
  if p_device_id is null or length(trim(p_device_id)) < 10 then
    raise exception 'Identifiant du navigateur invalide';
  end if;
  if not exists (select 1 from public.zones where id=p_zone_id and is_active=true) then
    raise exception 'Zone introuvable ou desactivee';
  end if;

  v_hash := md5(trim(p_device_id));
  select max(created_at) into v_last_time
  from public.reports
  where zone_id=p_zone_id and device_hash=v_hash;

  if v_last_time is not null and v_last_time > now() - interval '30 seconds' then
    raise exception 'Patientez 30 secondes avant un nouveau signalement dans cette zone';
  end if;

  insert into public.reports(zone_id,status,device_hash,created_at)
  values(p_zone_id,p_status,v_hash,now());
end;
$function$;
revoke all on function public.submit_report(uuid,text,text) from public;
grant execute on function public.submit_report(uuid,text,text) to anon, authenticated;

drop function if exists public.add_community_zone(text,text,text);
create function public.add_community_zone(p_name text, p_governorate text, p_device_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_name text;
  v_governorate text;
  v_hash text;
  v_id uuid;
begin
  v_name := trim(regexp_replace(coalesce(p_name,''), E'\\s+', ' ', 'g'));
  v_governorate := trim(coalesce(p_governorate,''));
  if length(v_name) not between 2 and 80 then raise exception 'Nom de zone invalide'; end if;
  if length(v_governorate) not between 2 and 50 then raise exception 'Gouvernorat invalide'; end if;
  if p_device_id is null or length(trim(p_device_id)) < 10 then raise exception 'Identifiant invalide'; end if;
  if exists(select 1 from public.zones where lower(trim(name))=lower(v_name) and lower(trim(governorate))=lower(v_governorate)) then
    raise exception 'Cette zone existe deja';
  end if;
  v_hash := md5(trim(p_device_id));
  if (select count(*) from public.zone_add_log where device_hash=v_hash and created_at>now()-interval '24 hours') >= 3 then
    raise exception 'Limite de 3 zones ajoutees par jour atteinte';
  end if;
  insert into public.zones(name,governorate,source,is_active)
  values(initcap(v_name),v_governorate,'community',true)
  returning id into v_id;
  insert into public.zone_add_log(device_hash) values(v_hash);
  return v_id;
end;
$function$;
revoke all on function public.add_community_zone(text,text,text) from public;
grant execute on function public.add_community_zone(text,text,text) to anon, authenticated;

-- Zones de depart : principales villes/délégations, modifiables dans Supabase.
insert into public.zones(name,governorate) values
('Tunis Centre','Tunis'),('La Marsa','Tunis'),('Le Bardo','Tunis'),('El Menzah','Tunis'),('El Omrane','Tunis'),('Carthage','Tunis'),('Sidi Bou Saïd','Tunis'),
('Ariana Ville','Ariana'),('La Soukra','Ariana'),('Raoued','Ariana'),('Mnihla','Ariana'),('Ettadhamen','Ariana'),
('Ben Arous','Ben Arous'),('Hammam Lif','Ben Arous'),('Mégrine','Ben Arous'),('Radès','Ben Arous'),('Mourouj','Ben Arous'),('Fouchana','Ben Arous'),
('Manouba','La Manouba'),('Denden','La Manouba'),('Oued Ellil','La Manouba'),('Douar Hicher','La Manouba'),
('Nabeul','Nabeul'),('Hammamet','Nabeul'),('Dar Chaâbane','Nabeul'),('Korba','Nabeul'),('Kélibia','Nabeul'),('Menzel Temime','Nabeul'),('Grombalia','Nabeul'),
('Zaghouan','Zaghouan'),('El Fahs','Zaghouan'),('Zriba','Zaghouan'),
('Bizerte','Bizerte'),('Menzel Bourguiba','Bizerte'),('Ras Jebel','Bizerte'),('Mateur','Bizerte'),('Sejnane','Bizerte'),
('Béja','Béja'),('Medjez el-Bab','Béja'),('Testour','Béja'),('Téboursouk','Béja'),
('Jendouba','Jendouba'),('Tabarka','Jendouba'),('Aïn Draham','Jendouba'),('Bou Salem','Jendouba'),
('Le Kef','Le Kef'),('Dahmani','Le Kef'),('Tajerouine','Le Kef'),('Sakiet Sidi Youssef','Le Kef'),
('Siliana','Siliana'),('Makthar','Siliana'),('Bou Arada','Siliana'),('Gaâfour','Siliana'),
('Sousse','Sousse'),('Hammam Sousse','Sousse'),('Akouda','Sousse'),('Msaken','Sousse'),('Kalaa Kebira','Sousse'),('Enfidha','Sousse'),
('Monastir','Monastir'),('Moknine','Monastir'),('Ksar Hellal','Monastir'),('Jemmal','Monastir'),('Sahline','Monastir'),
('Mahdia','Mahdia'),('Ksour Essef','Mahdia'),('El Jem','Mahdia'),('Chebba','Mahdia'),
('Sfax Ville','Sfax'),('Sakiet Ezzit','Sfax'),('Sakiet Eddaïer','Sfax'),('El Ain','Sfax'),('Thyna','Sfax'),('Mahres','Sfax'),('Kerkennah','Sfax'),
('Kairouan','Kairouan'),('Haffouz','Kairouan'),('Oueslatia','Kairouan'),('Sbikha','Kairouan'),
('Kasserine','Kasserine'),('Sbeitla','Kasserine'),('Fériana','Kasserine'),('Thala','Kasserine'),
('Sidi Bouzid','Sidi Bouzid'),('Regueb','Sidi Bouzid'),('Meknassy','Sidi Bouzid'),('Jelma','Sidi Bouzid'),
('Gabès','Gabès'),('Mareth','Gabès'),('El Hamma','Gabès'),('Ghannouch','Gabès'),
('Médenine','Médenine'),('Zarzis','Médenine'),('Djerba Houmt Souk','Médenine'),('Djerba Midoun','Médenine'),('Ben Gardane','Médenine'),
('Tataouine','Tataouine'),('Ghomrassen','Tataouine'),('Remada','Tataouine'),
('Gafsa','Gafsa'),('Métlaoui','Gafsa'),('Redeyef','Gafsa'),('Mdhilla','Gafsa'),
('Tozeur','Tozeur'),('Nefta','Tozeur'),('Degueche','Tozeur'),
('Kébili','Kébili'),('Douz','Kébili'),('Souk Lahad','Kébili')
on conflict(name,governorate) do nothing;


drop view if exists public.zone_status;
create view public.zone_status as
select
  z.id,
  z.name,
  z.governorate,
  z.source,
  last_report.status as current_status,
  last_report.created_at as last_report_at,
  coalesce(report_total.reports_count,0)::integer as reports_count
from public.zones z
left join lateral (
  select r.status,r.created_at
  from public.reports r
  where r.zone_id=z.id
  order by r.created_at desc,r.id desc
  limit 1
) last_report on true
left join lateral (
  select count(*)::integer as reports_count
  from public.reports r2
  where r2.zone_id=z.id
) report_total on true
where z.is_active=true;

grant select on public.zone_status to anon, authenticated;
notify pgrst, 'reload schema';
commit;

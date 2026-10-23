-- Sky Night: evolución social (portadas, avatares extendidos y música en historias)

alter table if exists public.profiles 
  add column if not exists cover_url text,
  add column if not exists avatar_url text;

create table if not exists public.music_tracks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  artist text not null,
  audio_url text not null,
  genre text default 'Pop/Party',
  duration_seconds int default 30,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table if exists public.stories
  add column if not exists music_track_id uuid references public.music_tracks(id) on delete set null,
  add column if not exists music_title text;

create unique index if not exists music_tracks_title_artist_key
  on public.music_tracks (title, artist);

-- Insertar música predeterminada estilo Facebook / social
insert into public.music_tracks (title, artist, audio_url, genre, duration_seconds) values
('Summer Party Anthem', 'Sky Night Sound', 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf756.mp3?filename=summer-party-110444.mp3', 'Electronic', 30),
('Night Out Beat', 'Club Vibes', 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=energetic-hip-hop-8303.mp3', 'Hip-Hop', 30),
('Chill Bar Lofi', 'Midnight Sip', 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=lofi-study-112191.mp3', 'Lofi', 30),
('Weekend Vibe', 'Celebration', 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9934444558.mp3?filename=upbeat-funk-124993.mp3', 'Pop', 30),
('Electro Bar Groove', 'Neon Lights', 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_2041cb3328.mp3?filename=future-bass-7988.mp3', 'Electronic', 30),
('Acoustic Sunset', 'Sunset Acoustic', 'https://cdn.pixabay.com/download/audio/2022/05/16/audio_14529244bb.mp3?filename=acoustic-guitars-113206.mp3', 'Acoustic', 30)
on conflict (title, artist) do nothing;

-- Habilitar RLS en music_tracks
alter table public.music_tracks enable row level security;
drop policy if exists music_tracks_select_all on public.music_tracks;
create policy music_tracks_select_all on public.music_tracks
for select to authenticated, anon
using (true);

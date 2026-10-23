# Hallazgos de implementación de Historias

La versión estable anterior de `app/(tabs)/stories.tsx` ya contiene compresión de imágenes y vídeo, límite de vídeo de 15 segundos, subida a Supabase Storage, expiración de 24 horas, selector de visibilidad mediante `visibility`, música/audio y visor con progreso segmentado.

La migración 0011 debe usar `privacy = all_friends | close_friends | public`, mapear los registros antiguos con `visibility = friends` a `all_friends`, y mantener políticas RLS basadas en amistades aceptadas. Los amigos cercanos se modelarán explícitamente en `close_friends`; un Estado marcado `close_friends` no debe ser visible hasta que exista esa relación.

Las reacciones deben tener una por usuario y Estado con `story_reactions(story_id, user_id, emoji)`. Las vistas deben ser idempotentes con `story_views(story_id, viewer_id)` y solo el autor puede consultar quién vio sus Estados. La política de inserción de reacciones debe comprobar `user_id = auth.uid()`; la política de vistas debe comprobar `viewer_id = auth.uid()`.

No se debe reemplazar la pantalla estable completa por una implementación reducida, porque eso perdería música, audio, selección de privacidad, limpieza de Storage y manejo de vídeo. La integración debe hacerse sobre la versión estable.

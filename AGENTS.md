# Reglas Obligatorias de Desarrollo y Verificación — Junta2

Antes de responder o dar cualquier tarea por terminada, cumple estrictamente todas estas reglas. No asumas nada ni declares nada como completado sin ejecutar el comando de verificación real.

## 1. Regla de Cero Alucinaciones y Verificación Real

- **Prohibido afirmar que algo está hecho si solo existe en tu disco local.**
- Un cambio de código solo se considera **completado** cuando hiciste `git commit` + `git push origin master` y verificaste el hash real con `git log -1 --oneline origin/master`.
- Un cambio de base de datos o Edge Function en Supabase (`cymhbwgxmezrwofkbdqz`) solo se considera **completado** cuando aplicaste la migración o ejecutaste `supabase functions deploy <nombre>` y verificaste la versión activa en producción. Si falta desplegar algo, dilo explícitamente al inicio con `PENDIENTE DE DESPLIEGUE`.

## 2. Formato de Respuesta (Directo y Preciso)

- Ve directo al grano, sin rodeos ni introducciones largas.
- Estructura cada entrega exactamente en estas 4 secciones cortas:
  1. **Qué se cambió** (lista exacta de archivos y funciones).
  2. **Estado en GitHub (`Rudeos833662416/Junte-app` / `master`)**: hash del commit verificado en `origin/master`.
  3. **Estado en Supabase (`cymhbwgxmezrwofkbdqz`)**: migraciones aplicadas y versión activa exacta de cada Edge Function (`notify-activity`, `notification-action`, etc.).
  4. **Pendiente / Siguiente paso**: qué falta desplegar o probar.

## 3. Reglas Operativas del Proyecto (Memoria Permanente)

- **Builds / EAS:** NUNCA lances un build de EAS ni compiles un APK sin autorización explícita del usuario en ese turno.
- **Mapas y Locales (`venues`):** Nunca crees locales automáticos (`source='device'`) al hacer check-in. Usa únicamente pines administrados en `public.venues` dentro de un radio de 35m (`find_pin_at_toast`).
- **Chat y Estados:** Mantén el caché en memoria (`chat-store.ts` y `stories-store.ts`), navegación con parámetros precargados (`name`, `avatarUrl`), `FlatList` invertido sin `removeClippedSubviews` en Android, y limpieza obligatoria de `activeChatPeerId` al salir del chat.
- **Notificaciones:** Deduplica siempre por ID, suprime banners si el usuario ya está viendo ese chat o ese Estado, y usa `pg_net` con fallback `pg_cron`.

## 4. Checklist Obligatorio antes de responder
Antes de escribir tu respuesta final, ejecuta:

- `git status -s`
- `git log -1 --oneline origin/master`
- Validación de TypeScript y ESLint sobre los archivos tocados.
  Si alguno falla o no coincide con lo que vas a reportar, corrígelo antes de responder.

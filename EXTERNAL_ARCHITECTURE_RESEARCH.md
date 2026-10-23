# Investigación: arquitectura independiente de Manus para SocialSip

## Fuentes oficiales consultadas

### Supabase Auth
URL: https://supabase.com/docs/guides/auth

Supabase Auth ofrece password, magic link, OTP, login social y SSO. Usa JWT y se integra con Row Level Security. Auth utiliza la base PostgreSQL del proyecto para datos de usuarios y puede relacionarse con tablas propias mediante triggers y referencias.

### Firebase Authentication
URL: https://firebase.google.com/docs/auth

Firebase Authentication ofrece servicios backend, SDKs y UI preparada. Soporta contraseña, teléfono, proveedores federados como Google, Facebook y Twitter, además de Apple, GitHub y autenticación anónima. Se integra con servicios Firebase y utiliza estándares OAuth 2.0 y OpenID Connect.

### Appwrite Auth
URL: https://appwrite.io/docs/products/auth

Appwrite ofrece email/password, teléfono, magic URL, OTP, OAuth2, sesiones anónimas, JWT, SSR, tokens personalizados y MFA. También documenta presencias para estados online y eventos en tiempo real. Es una alternativa con opción de autoalojamiento.

## Decisión preliminar

Para SocialSip se recomienda **Supabase** como primera opción porque concentra Auth, PostgreSQL, Storage, Realtime y RLS en un solo proyecto y se adapta al modelo relacional de usuarios, amistades, bares, check-ins e historias. Firebase es fuerte si se priorizan notificaciones y servicios Google, pero exige decidir entre Firestore y Realtime Database. Appwrite es atractivo si se desea autoalojar y controlar la infraestructura, aunque aumenta la responsabilidad operativa.

## Servicios complementarios

- Mapas: Google Maps Platform o Mapbox para tiles, geocodificación y claves separadas por plataforma.
- Notificaciones: Expo Notifications/EAS para APNs y FCM; el servidor externo debe guardar los Expo Push Tokens y llamar al servicio de push.
- Historias: Supabase Storage o un bucket S3 compatible. Las políticas deben impedir que un usuario elimine archivos ajenos.
- Música: se debe usar música propia, con licencia o proporcionada por el usuario. No conviene distribuir un catálogo comercial sin licencia.

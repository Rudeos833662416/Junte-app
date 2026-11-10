from pathlib import Path
from xml.sax.saxutils import escape
import json

OUT=Path('/home/ubuntu/Junte-app/design-export/junta2-figma-frames'); OUT.mkdir(parents=True,exist_ok=True)
W,H=390,844; BG='#070A12'; PANEL='#101726'; PANEL2='#151F31'; TEXT='#F7FBFF'; MUTED='#9BA9BC'; BLUE='#8BC8FF'; GOLD='#F4C542'; RED='#EF4444'; GREEN='#57D68D'; PURPLE='#A855F7'
def e(s): return escape(str(s))
def t(x,y,s,z=14,c=TEXT,w='400',a='start'): return f'<text x="{x}" y="{y}" fill="{c}" font-family="Inter,Arial,sans-serif" font-size="{z}" font-weight="{w}" text-anchor="{a}">{e(s)}</text>'
def r(x,y,w,h,c,rx=16,stroke='none',sw=0): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{c}" stroke="{stroke}" stroke-width="{sw}"/>'
def circ(x,y,z,c): return f'<circle cx="{x}" cy="{y}" r="{z}" fill="{c}"/>'
def av(x,y,letter,c): return circ(x,y,22,c)+t(x,y+6,letter,16,'#fff','700','middle')
def card(y,title,body,accent=BLUE): return r(20,y,350,78,PANEL,18)+r(20,y,5,78,accent,3)+t(40,y+29,title,15,TEXT,'700')+t(40,y+53,body,12,MUTED)
def tabs(active):
    out=r(12,772,366,60,PANEL,20); items=['Inicio','Amigos','Mapa','Actividad','Eventos','Perfil']
    icons=['⌂','♡','⌖','◌','◷','◉']
    for i,label in enumerate(items):
        x=42+i*61; c=BLUE if label==active else MUTED
        out+=t(x,798,icons[i],22,c,'700','middle')+t(x,820,label,9,c,'600','middle')
    return out
def frame(title,subtitle,active,body): return '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><title>'+e(title)+'</title>'+r(0,0,W,H,BG,0)+t(24,48,title,28,TEXT,'800')+t(24,72,subtitle,13,MUTED)+body+tabs(active)+'</svg>'
def notification(title,body,kind,actions):
    accent={'Mensaje':BLUE,'Solicitud de amistad':GREEN,'Brindis compartido':GOLD}[kind]
    s='<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><title>'+e(kind)+'</title>'+r(0,0,W,H,'#EDEFF3',0)+t(24,48,'Vista previa de notificaciones',22,'#101522','800')+t(24,74,'Estados del sistema · Junta2',13,'#5C6675')+r(16,116,358,142,'#fff',22,'#D9DFE8',1)+av(48,156,kind[0],accent)+t(82,148,'Junta2',11,'#7A8492','600')+t(82,172,title,16,'#111827','700')+t(82,196,body,13,'#4B5563')+t(82,222,'ahora',11,'#9CA3AF')+r(16,282,358,190,PANEL,24)+t(34,320,kind,19,TEXT,'800')+t(34,348,'Cómo se verá en Android',12,MUTED)+r(34,370,322,74,PANEL2,16)+av(62,407,kind[0],accent)+t(94,401,title,14,TEXT,'700')+t(94,422,body,12,MUTED)
    x=34
    for action in actions:
        is_primary=action in ('Aceptar','Responder'); c=accent if is_primary else '#263247'; tc='#08111D' if is_primary else TEXT
        s+=r(x,458,148,34,c,17)+t(x+74,480,action,12,tc,'700','middle'); x+=160
    return s+t(24,538,'Interacciones',18,'#111827','800')+t(24,564,'Tocar el cuerpo abre la pantalla contextual.',13,'#5C6675')+t(24,588,'Las acciones rápidas funcionan sin abrir la app.',13,'#5C6675')+'</svg>'

screens={}
screens['01-login.svg']='<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><title>Junta2 · Iniciar sesión</title>'+r(0,0,W,H,BG,0)+t(195,254,'Tragos Sociales',30,TEXT,'800','middle')+t(195,282,'time to drink',12,GOLD,'600','middle')+t(195,314,'Tus amigos, tus bares y tus mejores planes',13,MUTED,'400','middle')+t(195,334,'en un solo lugar.',13,MUTED,'400','middle')+r(18,370,354,48,PANEL,12)+t(34,399,'Email',13,MUTED)+r(18,430,354,48,PANEL,12)+t(34,459,'Contraseña',13,MUTED)+r(18,500,354,52,BLUE,16)+t(195,532,'Iniciar sesión',14,'#07111E','700','middle')+r(18,566,354,52,'none',16,'#3D4C61',1)+t(195,598,'Continuar con Google',14,TEXT,'700','middle')+t(195,660,'¿No tienes cuenta? Crear una',13,MUTED,'600','middle')+'</svg>'
configs=[('02-inicio.svg','Inicio','Tu noche, tus amigos, tus planes','Inicio',['Brindis compartido|Comparte que estás tomando algo|#F4C542','Planes cerca de ti|Descubre lugares y eventos|#8BC8FF','Actividad reciente|Ana respondió a tu comentario|#A855F7']),('03-amigos.svg','Amigos','Conecta y comparte con tu gente','Amigos',['Solicitudes para conectar|María López quiere agregarte|#57D68D','Perfiles públicos|Diego Martínez · activo ahora|#8BC8FF','Cerca de ti|Sofía Ruiz está cerca|#A855F7']),('04-solicitudes.svg','Solicitudes','Gestiona tus conexiones','Amigos',['Pendiente|María López · solicitud recibida|#57D68D','Acciones|Aceptar o rechazar|#8BC8FF']),('05-mapa.svg','Mapa','Encuentra a tus amigos y lugares','Mapa',['Bar Central|A 350 m · 4 amigos activos|#F4C542','Terraza Norte|A 800 m · 2 amigos activos|#57D68D']),('06-actividad.svg','Actividad','Lo que pasa con tu gente','Actividad',['Respuesta a comentario|Ana respondió “Nos vemos allí”|#A855F7','Solicitud aceptada|Carlos ahora es tu amigo|#57D68D','Nuevo estado|María publicó una actualización|#8BC8FF']),('07-eventos.svg','Eventos','Planes para esta noche','Eventos',['Noche de salsa|Hoy · 21:00 · Club Havana|#F4C542','Brindis social|Viernes · 22:30 · Bar Central|#A855F7','After office|Sábado · 20:00 · Terraza Norte|#57D68D']),('08-perfil.svg','Mi perfil','Tu identidad en Junta2','Perfil',['Historias|Gestiona tus estados y música|#8BC8FF','Mensajes|Conversaciones privadas|#57D68D','Privacidad|Perfil público · Visible cerca|#A855F7']),('09-estados.svg','Estados','Comparte algo por 24 horas','Inicio',['Mi estado|Pulsa para ver tus estados activos|#F4C542','Nueva actualización|Comparte una foto o vídeo|#8BC8FF','Actualizaciones recientes|Sofía Ruiz · hace 20 min|#A855F7']),('10-mensajes.svg','Mensajes','Tus conversaciones','Inicio',['María López|¿Nos vemos esta noche?|#57D68D','Diego Martínez|Te envió una foto|#8BC8FF','Sofía Ruiz|Perfecto, allí estaré|#A855F7']),('11-chat.svg','María López','En línea ahora','Inicio',['¿Nos vemos esta noche?|María López|#57D68D','Sí, llego en 10 minutos|Tú|#8BC8FF']),('12-perfil-amigo.svg','Perfil público','Conexión y controles','Inicio',['Enviar mensaje|Habla en privado|#8BC8FF','Eliminar amiga|Quita la conexión|#263247','Bloquear usuario|No recibirá interacciones|#EF4444']),('13-scan-qr.svg','Escanear amigo','Añade contactos rápidamente','Amigos',['Código QR|Apunta la cámara al código|#8BC8FF'])]
for fname,title,sub,active,rows in configs:
    body=''; y=112
    if fname=='13-scan-qr.svg': body=r(62,140,266,266,'#fff',20)+t(195,282,'QR',64,'#111827','800','middle')+t(195,450,'Apunta la cámara al código QR',15,TEXT,'700','middle')+r(62,486,266,48,BLUE,20)+t(195,516,'Abrir cámara',13,'#07111E','700','middle')
    else:
        for title2,body2,color in [row.split('|') for row in rows]: body+=card(y,title2,body2,color); y+=96
    screens[fname]=frame(title,sub,active,body)
screens['14-notificacion-mensaje.svg']=notification('María López','¿Nos vemos esta noche?','Mensaje',['Responder','Abrir chat'])
screens['15-notificacion-solicitud.svg']=notification('María López quiere conectar contigo','Toca para ver su perfil','Solicitud de amistad',['Aceptar','Ver perfil'])
screens['16-notificacion-brindis.svg']=notification('Carlos está tomando algo','Bar Central · 4 amigos activos','Brindis compartido',['Ver brindis','Ver mapa'])
for filename,svg in screens.items(): (OUT/filename).write_text(svg,encoding='utf-8')
manifest={'name':'Junta2 · Figma frames','viewport':{'width':W,'height':H},'format':'SVG editable','count':len(screens),'screens':[{'file':f} for f in screens], 'notes':['Arrastra cada SVG a Figma; formas y textos quedan como capas editables.','Las notificaciones incluyen acciones rápidas.']}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Generated',len(screens),'frames')

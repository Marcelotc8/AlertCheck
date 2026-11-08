# StormCheck: defensa ante los jueces

Cada afirmación de este documento se puede mostrar en el código. Junto a cada una está el archivo que la respalda.

---

## 1. Preguntas difíciles

### P1. "Las reglas offline y las del backend se pueden desincronizar"

> "Ya no. Al principio estaban copiadas en dos lugares; ahora hay **un solo archivo de reglas** (`api/src/scamSignals.ts`) que usan el backend y la web. La web lo importa directamente al compilarse, así que es imposible que diverjan.
> El Service Worker se encarga de que el teléfono tenga la última versión: cada vez que el usuario abre la app con internet, baja la versión nueva de la web, y con ella las reglas nuevas. Si se corta la red, sigue funcionando con la última versión que guardó. En una emergencia, un motor de reglas funcionando sin red vale más que una pantalla de 'sin conexión'."

Respaldo: `api/src/scamSignals.ts`, `web/src/lib/offlineClassifier.ts` (importa `@api/scamSignals`), `web/public/sw.js`.

### P2. "¿Para qué IA si tienen reglas?"

> "Las reglas son como un antivirus: atrapan lo conocido (pagos, datos bancarios, links acortados, dominios falsos) y **ninguna inyección de prompt las puede convencer**. La IA ve lo que las reglas no ven: manipulación sutil, refugios inventados sin pedir dinero, contradicciones con el aviso oficial. Y además explica el veredicto a nivel de 6º grado en dos idiomas.
> La clave es la jerarquía: **la IA puede bajar la confianza, nunca subirla por su cuenta.** 'Verificada' se demuestra con código."

### P3. "¿Y la inyección de prompt? Un estafador puede escribirle instrucciones a su IA"

> "Lo probamos atacándonos a nosotros mismos: `npm run redteam` lanza 8 ataques reales contra el sistema completo, y los 8 quedan bloqueados. Hay cuatro capas:
> 1. **Verificada exige prueba.** El veredicto 'verified' solo se acepta si la alerta oficial existe de verdad en la lista del NWS, si el texto nombra ese evento y esa zona, y si no agrega nada sospechoso (teléfonos, links que no son .gov, pedidos). Si falta algo, el código lo baja aunque la IA diga lo contrario.
> 2. **Detector de instrucciones a la IA.** Una alerta real nunca le habla a un modelo. Frases como 'ignora las instrucciones', 'output verified' o una lista oficial falsa son, por sí mismas, señal fuerte de estafa.
> 3. **Delimitadores que no se pueden falsificar.** El mensaje va entre etiquetas con un ID aleatorio por petición, y cada uno de los 4 agentes tiene la orden de tratarlo como datos, nunca como instrucciones.
> 4. **La explicación no puede ser un canal para el estafador.** En los mensajes sospechosos, el texto es siempre una plantilla revisada, no texto libre de la IA. En los demás, se descarta cualquier explicación que traiga teléfonos, links que no son .gov o contradiga la etiqueta."

Demo en vivo: en el ataque del "refugio inventado", Gemini llegó a escribir que la alerta *era oficial*, y el filtro descartó esa explicación automáticamente. Eso demuestra que no confiamos en la IA, la vigilamos.

Respaldo: `api/src/swarmVerify.ts` (barandales 1 y 2), `api/src/check.ts`, `api/scripts/redteam.ts`.

**Lo que se dice con honestidad:** "Ninguna defensa contra la inyección de prompt es perfecta, así que diseñamos el sistema asumiendo que la IA puede ser engañada. Aunque lo sea, no puede producir un 'Verificada' falso ni mostrar un teléfono del estafador."

### P4. "Ataque de denegación de billetera: alguien les agota el saldo"

> "Cada verificación cuesta unos $0.04 (Swarms), así que lo tomamos en serio:
> 1. **Límite por IP** en el servidor: 20 por minuto y 300 por día (configurable). Es generoso a propósito, porque en un refugio o en un evento mucha gente comparte la misma IP.
> 2. **Tope diario de gasto** en IA (por defecto $10/día).
> 3. Al pasarse de cualquiera de los dos, la API responde 429 y **la web cae sola al análisis local con reglas**: el usuario sigue recibiendo un veredicto, no una pantalla de error.
> 4. **Cortacircuitos de Gemini:** si se agota la cuota, deja de insistir durante 5 minutos. Las explicaciones pasan a plantillas y las capturas avisan que se pegue el texto."

Respaldo: `api/src/limits.ts`, `api/src/index.ts` (`/verify`), `api/src/gemini.ts`, `web/src/app/page.tsx`.

**No decir:** que Auth0 limita peticiones (el login es opcional y solo sirve para el historial) ni que Caddy bloquea IPs (Caddy da el HTTPS).

---

## 2. Arquitectura: el porqué de cada pieza

**Next.js + Tailwind (web y PWA).** El Service Worker (`sw.js`) y el `manifest` hacen que la web se instale como app y abra sin internet. Las últimas alertas oficiales se guardan en el teléfono para clasificar mensajes sin conexión.

**Swarms (enjambre de 4 agentes).** Divide el trabajo: el **Extractor** saca los datos, el **OfficialMatcher** compara con el NWS, el **ScamDetector** busca tácticas de engaño y el **Judge** decide. Separar las tareas *reduce* errores y alucinaciones, aunque no las elimina, y por eso la última palabra la tienen los barandales en código.

**Gemini (visión y redacción).** En un huracán la gente no copia textos: manda capturas de WhatsApp. Gemini transcribe la imagen y redacta la explicación en inglés y español. Su texto pasa por un filtro antes de mostrarse.

**Prune (gateway de Gemini).** Las llamadas de texto a Gemini pasan por Prune, que entrega un recibo de costo por llamada. Su caché quedó **apagada a propósito**: en las pruebas, la caché semántica devolvió "esta alerta es auténtica" para una estafa. En verificación, una respuesta reciclada es inaceptable.
*(Los ~$0.04 por alerta los reporta Swarms, no Prune.)*

**Tiger Data (PostgreSQL + TimescaleDB).** Guarda cada verificación en una *hypertable* particionada por tiempo, y `/stats` agrupa por hora con `time_bucket`. Alimenta "Mi historial" para voluntarios y refugios. Si la base de datos se cae, la app sigue verificando y solo deja de guardar.

**Vultr + Caddy (servidor de la API).** Vultr corre la API con pm2, y Caddy le da HTTPS automático. El HTTPS hace falta porque una web segura no puede llamar a una API sin HTTPS. *(El HTTPS que permite instalar la PWA lo da el hosting de la web.)*

**Auth0 (opcional).** Inicio de sesión para guardar y ver el historial. No hace falta para verificar.

---

## 3. El diferenciador

1. **Seguridad por diseño.** No confiamos en la IA, la vigilamos. "Verificada" se demuestra con código contra los datos reales del NWS, las reglas tienen autoridad sobre los agentes, y lo comprobamos con 8 ataques reales (`npm run redteam`): 8/8 bloqueados, y 10/10 en la demo de Milton.
2. **Resiliencia real.** Sin internet, la PWA verifica en el teléfono. Si se cae la base de datos, la API sigue. Si Gemini se queda sin cuota o llega el límite de gasto, la app sigue con plantillas y reglas.
3. **Cero fricción.** Sin cuenta obligatoria, se puede subir una foto en vez de escribir, y el resultado es un semáforo de 3 estados (**verde** verificada, **ámbar** sospechosa, **gris** no verificada) con una explicación bilingüe de 6º grado.

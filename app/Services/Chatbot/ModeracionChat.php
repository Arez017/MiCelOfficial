<?php

namespace App\Services\Chatbot;

use Illuminate\Support\Str;

/**
 * Filtro del Asistente MiCEL. Revisa lo que escribe el cliente y lo que responde la IA.
 *
 * Detecta aunque escriban "trampeado": mayúsculas, tildes, 4→a 3→e 1→i 0→o 5→s,
 * letras repetidas ("puuuuta") o separadas ("p u t a", "p.u.t.a").
 * Compara palabras completas, así "computadora" o "disputa" no se bloquean.
 *
 * Resultado: null (mensaje normal) o uno de:
 *   grosero  → insultos / groserías / faltas de respeto        (cuenta como aviso)
 *   obsceno  → contenido sexual u obsceno                       (cuenta como aviso)
 *   amenaza  → amenazas al personal o al local                  (cuenta como aviso)
 *   queja    → reclamo fuerte sin insultos ("son unos estafadores"): se atiende con calma
 */
class ModeracionChat
{
    public const GROSERO = 'grosero';

    public const OBSCENO = 'obsceno';

    public const AMENAZA = 'amenaza';

    public const QUEJA = 'queja';

    /** Palabras completas (ya normalizadas: minúsculas, sin tildes, ñ → n). */
    private const GROSERIAS = [
        'puta', 'puto', 'putas', 'putos', 'putita', 'mierda', 'mierdas', 'carajo', 'carajos',
        'verga', 'vergas', 'pendejo', 'pendeja', 'pendejos', 'pendejas', 'idiota', 'idiotas',
        'imbecil', 'imbeciles', 'estupido', 'estupida', 'estupidos', 'estupidas', 'cabron',
        'cabrona', 'cabrones', 'maricon', 'maricona', 'maricones', 'marica', 'maricas', 'joder',
        'jodete', 'jodanse', 'culero', 'culera', 'culeros', 'hdp', 'hdpm', 'ctm', 'ptm', 'csm',
        'conchatumadre', 'conchetumadre', 'conchesumadre', 'malparido', 'malparida', 'chingar',
        'chingada', 'chingado', 'chingate', 'chinguen', 'pinche', 'pinches', 'cojudo', 'cojuda',
        'cojudos', 'cojudas', 'cojudez', 'huevon', 'huevona', 'huevones', 'weon', 'weona',
        'webon', 'tarado', 'tarada', 'tarados', 'retrasado', 'retrasada', 'mongolico',
        'mongolica', 'zorra', 'zorras', 'bastardo', 'bastarda', 'mamon',
        'mamona', 'lameculos', 'culiao', 'culiado', 'culiada', 'mrd', 'vrg', 'pndj', 'mierdero',
        'imbesil', 'estupidez', 'gilipollas', 'subnormal', 'baboso', 'babosa',
        'chinga', 'chingas', 'chingues', 'chingue', 'perra', 'perras', 'jodido', 'jodida',
        'hijueputa', 'hijoputa', 'malnacido', 'malnacida', 'cagon', 'cagona', 'mierdoso',
        'mierdosa', 'gonorrea', 'mrda', 'vrga', 'ptmr',
    ];

    /** Frases (sobre el texto normalizado, con espacios simples). */
    private const FRASES_GROSERAS = [
        'concha de tu', 'concha tu madre', 'chupame', 'chupa mi', 'me vale verga',
        'a la mierda', 'hijo de perra', 'chinga tu madre', 'tu puta madre', 'hijo de puta',
        'hija de puta', 'vete a la mierda', 'vete al carajo',
    ];

    private const OBSCENIDADES = [
        'pene', 'penes', 'vagina', 'vaginas', 'tetas', 'tetitas', 'culo', 'culos', 'polla',
        'porno', 'porn', 'xxx', 'sexo', 'sexual', 'sexuales', 'follar', 'follame', 'mamada',
        'mamadas', 'pajero', 'pajera', 'desnuda', 'desnudo', 'desnudas', 'nudes', 'nude',
        'chupala', 'chupamela', 'orgia', 'violar', 'violacion', 'cogerte', 'cogemos', 'puteria',
        'prostituta', 'escort', 'onlyfans', 'erotico', 'erotica', 'sexting', 'hentai',
    ];

    /** Raíces: cualquier palabra que empiece así. */
    private const RAICES_OBSCENAS = ['masturb', 'pornogr', 'eyacul', 'fornic', 'cachond'];

    private const AMENAZAS = [
        'te voy a matar', 'los voy a matar', 'las voy a matar', 'voy a matarte', 'te mato',
        'los mato', 'voy a quemar', 'quemar el local', 'quemar tu local', 'poner una bomba',
        'les voy a romper', 'te voy a romper', 'te voy a pegar', 'ya van a ver lo que les pasa',
    ];

    private const QUEJAS = [
        'estafa', 'estafas', 'estafador', 'estafadores', 'ladron', 'ladrones', 'ladrona', 'rateros',
        'fraude', 'inutiles', 'pesimo', 'pesima', 'pesimos', 'basura', 'porqueria',
        'incompetentes', 'mentirosos', 'sinverguenzas', 'chafa', 'malisimo', 'malisima',
    ];

    /** Clasifica un texto. */
    public function analizar(string $texto): ?string
    {
        [$tokens, $plano] = $this->normalizar($texto);

        foreach (self::AMENAZAS as $f) {
            if (str_contains($plano, $f)) {
                return self::AMENAZA;
            }
        }

        $obsceno = false;
        $grosero = false;
        $queja = false;

        foreach ($tokens as $t) {
            foreach ($this->variantes($t) as $v) {
                if (in_array($v, self::GROSERIAS, true)) {
                    $grosero = true;
                }
                if (in_array($v, self::OBSCENIDADES, true) || Str::startsWith($v, self::RAICES_OBSCENAS)) {
                    $obsceno = true;
                }
                if (in_array($v, self::QUEJAS, true)) {
                    $queja = true;
                }
            }
        }

        foreach (self::FRASES_GROSERAS as $f) {
            if (str_contains($plano, $f)) {
                $grosero = true;
            }
        }

        return match (true) {
            $obsceno => self::OBSCENO,
            $grosero => self::GROSERO,
            $queja => self::QUEJA,
            default => null,
        };
    }

    /** True si el resultado cuenta como falta de respeto (suma aviso). */
    public static function esFalta(?string $tipo): bool
    {
        return in_array($tipo, [self::GROSERO, self::OBSCENO, self::AMENAZA], true);
    }

    /**
     * @return array{0: string[], 1: string} palabras normalizadas y el texto plano
     */
    private function normalizar(string $texto): array
    {
        $t = Str::lower(Str::ascii($texto));
        $t = strtr($t, ['4' => 'a', '@' => 'a', '3' => 'e', '1' => 'i', '!' => 'i', '0' => 'o', '5' => 's', '$' => 's', '7' => 't']);
        $t = (string) preg_replace('/[^a-z]+/', ' ', $t);

        // Une letras sueltas seguidas: "p u t a" → "puta"
        $t = (string) preg_replace_callback('/\b(?:[a-z] ){2,}[a-z]\b/', fn ($m) => str_replace(' ', '', $m[0]), $t);

        // Letras repetidas 3+ veces → una ("puuuta" → "puta")
        $t = (string) preg_replace('/([a-z])\1{2,}/', '$1', $t);
        $t = trim((string) preg_replace('/\s+/', ' ', $t));

        return [$t === '' ? [] : explode(' ', $t), $t];
    }

    /** La palabra tal cual y con letras dobles reducidas ("mierrda" → "mierda"). */
    private function variantes(string $token): array
    {
        $simple = (string) preg_replace('/([a-z])\1+/', '$1', $token);

        return $simple === $token ? [$token] : [$token, $simple];
    }
}

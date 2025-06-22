export function calculateSingpostRate(destination, weight_kg, dimensions_mm, use_speedpost = true) {
    const [length, width, height] = dimensions_mm;
    const lwh_sum = length + width + height;

    const DOMESTIC_PACKAGE_LIMIT = [324, 229, 65];
    const DOMESTIC_PARCEL_LIMIT = [600, 400, 300];
    const MAX_DOMESTIC_PARCEL_WEIGHT_KG = 30;

    const intl_rates = {
        'zone_a': [3.50, 5.70, 10.10, 20.00],
        'zone_b': [5.70, 12.50, 22.50, 45.00],
        'zone_c': [8.30, 17.50, 31.50, 63.00],
        'zone_d': [11.90, 21.10, 35.10, 66.60],
    };

    const sp_rates = {
        'zone_a': [26, 26, 43, 66],
        'zone_b': [37, 37, 64, 106],
        'zone_c': [80, 80, 135, 202],
        'zone_d': [86, 86, 160, 282],
    };
    const weight_brackets = [0.25, 0.5, 1.0, 2.0];
    const weight_brackets_sp = [2, 5, 10, 20];

    if (destination === 'domestic') {
        if (
            weight_kg <= 2 &&
            DOMESTIC_PACKAGE_LIMIT.every((l, i) => dimensions_mm[i] <= l)
        ) {
            return 3.0;
        } else if (use_speedpost) {
            if (
                DOMESTIC_PARCEL_LIMIT.every((l, i) => dimensions_mm[i] <= l) &&
                weight_kg <= MAX_DOMESTIC_PARCEL_WEIGHT_KG
            ) {
                return 6.0;
            } else if (
                lwh_sum <= 3000 &&
                Math.max(...dimensions_mm) <= 1500 &&
                weight_kg <= MAX_DOMESTIC_PARCEL_WEIGHT_KG
            ) {
                return 12.0;
            }
        }
    } else if (destination.startsWith('zone_')) {
        const zone = destination;
        for (let i = 0; i < weight_brackets.length; i++) {
            if (weight_kg <= weight_brackets[i]) {
                return intl_rates[zone][i];
            }
        }
    }
    if (use_speedpost && sp_rates[destination]) {
        for (let i = 0; i < weight_brackets_sp.length; i++) {
            if (weight_kg <= weight_brackets_sp[i]) {
                return sp_rates[destination][i];
            }
        }
    }
    return -1;
}

export function getDestinationZone(country) {
    if (!country) return "zone_d";
    const c = country.trim().toLowerCase();
    if (c === "singapore") return "domestic";
    if (c === "malaysia") return "zone_a";
    if (["china", "japan", "korea", "thailand", "vietnam", "indonesia", "philippines", "india", "taiwan", "hong kong"].includes(c)) return "zone_b";
    if (["australia", "new zealand", "europe", "united states", "usa", "canada"].includes(c)) return "zone_c";
    return "zone_d";
}
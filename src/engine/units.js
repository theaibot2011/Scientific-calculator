// Unit converter (enhancement; the fx-991ES itself has the 40 CONV presets in constants.js).
// Each unit: [symbol, name, factor to SI base unit] or for temperature an affine pair.
export const UNIT_CATEGORIES = {
  Length: { base: 'm', units: [['m', 'metre', 1], ['km', 'kilometre', 1e3], ['cm', 'centimetre', 1e-2], ['mm', 'millimetre', 1e-3], ['μm', 'micrometre', 1e-6], ['nm', 'nanometre', 1e-9], ['in', 'inch', 0.0254], ['ft', 'foot', 0.3048], ['yd', 'yard', 0.9144], ['mi', 'mile', 1609.344], ['nmi', 'nautical mile', 1852], ['au', 'astronomical unit', 149597870700], ['ly', 'light-year', 9460730472580800], ['pc', 'parsec', 3.0856775814913673e16], ['Å', 'ångström', 1e-10]] },
  Area: { base: 'm²', units: [['m²', 'square metre', 1], ['km²', 'square kilometre', 1e6], ['cm²', 'square centimetre', 1e-4], ['mm²', 'square millimetre', 1e-6], ['ha', 'hectare', 1e4], ['a', 'are', 100], ['acre', 'acre', 4046.8564224], ['ft²', 'square foot', 0.09290304], ['in²', 'square inch', 0.00064516], ['yd²', 'square yard', 0.83612736], ['mi²', 'square mile', 2589988.110336]] },
  Volume: { base: 'm³', units: [['m³', 'cubic metre', 1], ['L', 'litre', 1e-3], ['mL', 'millilitre', 1e-6], ['cm³', 'cubic centimetre', 1e-6], ['gal (US)', 'US gallon', 3.785411784e-3], ['gal (UK)', 'imperial gallon', 4.54609e-3], ['qt (US)', 'US quart', 9.46352946e-4], ['pt (US)', 'US pint', 4.73176473e-4], ['cup (US)', 'US cup', 2.365882365e-4], ['fl oz (US)', 'US fluid ounce', 2.95735295625e-5], ['ft³', 'cubic foot', 0.028316846592], ['in³', 'cubic inch', 1.6387064e-5]] },
  Mass: { base: 'kg', units: [['kg', 'kilogram', 1], ['g', 'gram', 1e-3], ['mg', 'milligram', 1e-6], ['μg', 'microgram', 1e-9], ['t', 'tonne', 1e3], ['lb', 'pound', 0.45359237], ['oz', 'ounce', 0.028349523125], ['st', 'stone', 6.35029318], ['ton (US)', 'short ton', 907.18474], ['ton (UK)', 'long ton', 1016.0469088], ['u', 'atomic mass unit', 1.6605390666e-27], ['ct', 'carat', 2e-4]] },
  Time: { base: 's', units: [['s', 'second', 1], ['ms', 'millisecond', 1e-3], ['μs', 'microsecond', 1e-6], ['ns', 'nanosecond', 1e-9], ['min', 'minute', 60], ['h', 'hour', 3600], ['d', 'day', 86400], ['wk', 'week', 604800], ['yr', 'Julian year (365.25 d)', 31557600]] },
  Speed: { base: 'm/s', units: [['m/s', 'metre per second', 1], ['km/h', 'kilometre per hour', 1 / 3.6], ['mph', 'mile per hour', 0.44704], ['kn', 'knot', 1852 / 3600], ['ft/s', 'foot per second', 0.3048], ['c', 'speed of light', 299792458], ['Mach', 'Mach (sea level, 15 °C)', 340.29]] },
  Temperature: { base: 'K', affine: true, units: [['°C', 'degree Celsius', [1, 273.15]], ['°F', 'degree Fahrenheit', [5 / 9, 459.67 * 5 / 9]], ['K', 'kelvin', [1, 0]], ['°R', 'degree Rankine', [5 / 9, 0]]] },
  Pressure: { base: 'Pa', units: [['Pa', 'pascal', 1], ['kPa', 'kilopascal', 1e3], ['MPa', 'megapascal', 1e6], ['bar', 'bar', 1e5], ['mbar', 'millibar', 100], ['atm', 'standard atmosphere', 101325], ['mmHg', 'millimetre of mercury', 133.322387415], ['Torr', 'torr', 101325 / 760], ['psi', 'pound per square inch', 6894.757293168361], ['kgf/cm²', 'kilogram-force per cm²', 98066.5], ['inHg', 'inch of mercury', 3386.389]] },
  Energy: { base: 'J', units: [['J', 'joule', 1], ['kJ', 'kilojoule', 1e3], ['MJ', 'megajoule', 1e6], ['cal', 'calorie (IT)', 4.1868], ['kcal', 'kilocalorie (IT)', 4186.8], ['Wh', 'watt-hour', 3600], ['kWh', 'kilowatt-hour', 3.6e6], ['eV', 'electronvolt', 1.602176634e-19], ['BTU', 'British thermal unit (IT)', 1055.05585262], ['ft·lbf', 'foot-pound force', 1.3558179483314004], ['erg', 'erg', 1e-7]] },
  Power: { base: 'W', units: [['W', 'watt', 1], ['kW', 'kilowatt', 1e3], ['MW', 'megawatt', 1e6], ['mW', 'milliwatt', 1e-3], ['hp', 'horsepower (mechanical)', 745.69987158227022], ['PS', 'metric horsepower', 735.49875], ['BTU/h', 'BTU per hour', 0.29307107017222], ['erg/s', 'erg per second', 1e-7]] },
  Force: { base: 'N', units: [['N', 'newton', 1], ['kN', 'kilonewton', 1e3], ['lbf', 'pound-force', 4.4482216152605], ['kgf', 'kilogram-force', 9.80665], ['dyn', 'dyne', 1e-5]] },
  Angle: { base: 'rad', units: [['°', 'degree', Math.PI / 180], ['rad', 'radian', 1], ['grad', 'gradian', Math.PI / 200], ["′", 'arcminute', Math.PI / 10800], ['″', 'arcsecond', Math.PI / 648000], ['turn', 'turn', 2 * Math.PI]] },
  Data: { base: 'B', units: [['bit', 'bit', 0.125], ['B', 'byte', 1], ['kB', 'kilobyte', 1e3], ['MB', 'megabyte', 1e6], ['GB', 'gigabyte', 1e9], ['TB', 'terabyte', 1e12], ['KiB', 'kibibyte', 1024], ['MiB', 'mebibyte', 1048576], ['GiB', 'gibibyte', 1073741824], ['TiB', 'tebibyte', 1099511627776]] },
  Frequency: { base: 'Hz', units: [['Hz', 'hertz', 1], ['kHz', 'kilohertz', 1e3], ['MHz', 'megahertz', 1e6], ['GHz', 'gigahertz', 1e9], ['rpm', 'revolutions per minute', 1 / 60], ['rad/s', 'radian per second', 1 / (2 * Math.PI)]] },
};

export function convertUnit(category, value, from, to) {
  const cat = UNIT_CATEGORIES[category];
  if (!cat) throw new Error('Unknown category');
  const u1 = cat.units.find((u) => u[0] === from), u2 = cat.units.find((u) => u[0] === to);
  if (!u1 || !u2) throw new Error('Unknown unit');
  if (cat.affine) {
    const [a1, b1] = u1[2], [a2, b2] = u2[2];
    const k = value * a1 + b1; // to kelvin
    return (k - b2) / a2;
  }
  return value * u1[2] / u2[2];
}

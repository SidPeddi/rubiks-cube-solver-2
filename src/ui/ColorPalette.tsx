import { COLORS, COLOR_HEX, COLOR_NAMES, type Color } from '../cube/types';

interface Props {
  selected: Color;
  onSelect: (c: Color) => void;
}

export function ColorPalette({ selected, onSelect }: Props) {
  return (
    <div className="palette" role="radiogroup" aria-label="Sticker color">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={selected === c}
          aria-label={COLOR_NAMES[c]}
          title={COLOR_NAMES[c]}
          className={`swatch ${selected === c ? 'swatch--selected' : ''}`}
          style={{ background: COLOR_HEX[c] }}
          onClick={() => onSelect(c)}
        />
      ))}
    </div>
  );
}

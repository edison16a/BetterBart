/** Search and trip-selection controls positioned over the map. */
export function StationSearch() {
  return (
    <div id="search">
      <div id="sbody">
        <StationField
          slot="a"
          placeholder="From"
          label="Origin station"
          clearLabel="Clear origin"
        />
        <StationField
          slot="b"
          placeholder="To"
          label="Destination station"
          clearLabel="Clear destination"
        />
        <button id="swap" title="Swap" aria-label="Swap stations">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 8h13M17 8l-3-3M17 8l-3 3M20 16H7M7 16l3-3M7 16l3 3" />
          </svg>
        </button>
        <button id="reset" title="Clear trip" aria-label="Clear trip">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{ slot: "a" | "b", placeholder: string, label: string, clearLabel: string }} props
 */
function StationField({ slot, placeholder, label, clearLabel }) {
  return (
    <div className={`fld ${slot}`} id={`fld${slot}`}>
      <span className="dot" />
      <input
        id={`in${slot}`}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck="false"
        aria-label={label}
      />
      <button className="clr" data-clr={slot} aria-label={clearLabel}>
        ✕
      </button>
      <div className="dd" id={`dd${slot}`} />
    </div>
  );
}

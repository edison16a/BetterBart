/** Live departures and step-by-step trip panel. Runtime content is dynamic. */
export function TripPanel() {
  return (
    <>
      <div id="panel">
        <div id="grab" aria-hidden="true" />
        <div className="phead">
          <span className="ptitle" id="ptitle">
            YOUR TRIP
          </span>
          <span className="sp" />
          <button className="icobtn" id="pclose" aria-label="Close panel">
            ✕
          </button>
        </div>
        <div id="pbody" />
      </div>
      <button id="resume">
        ▲ <span id="resumelbl">Trip</span>
      </button>
    </>
  );
}

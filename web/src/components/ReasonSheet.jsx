import { useEffect, useRef, useState } from "react";
import { VERDICTS } from "./VerdictBar.jsx";

const REASONS = {
  agree: ["Frisk result wrong", "Wrong person", "Body parts wrong", "Not a frisk", "Camera view blocked"],
  disagree: ["Frisk result right", "Reason doesn't match the video", "Rejected by mistake"],
  valid: ["Real issue", "Needs follow-up", "Staff mistake"],
  invalid: ["Nothing wrong", "Wrong time", "Wrong camera", "Added by mistake"],
};

// reason chips + optional note, then confirm
export default function ReasonSheet({ kind, verdict, swiped, onSave, onClose, onUndo }) {
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const first = useRef(null);
  const choice = VERDICTS[kind].find((v) => v.value === verdict);
  useEffect(() => { first.current && first.current.focus(); }, []);
  const toggle = (reason) => setPicked(picked.includes(reason) ? picked.filter((r) => r !== reason) : [...picked, reason]);

  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <h2 id="sheet-title">{swiped ? `Saved ✓ ${choice.label}` : `${choice.label}: ${choice.hint}`}</h2>
        <p className="muted">Why? Tap any that apply (optional).{swiped && <> <button className="linkbtn" onClick={onUndo}>Undo</button></>}</p>
        <div className="chips">
          {REASONS[verdict].map((reason, index) => (
            <button key={reason} ref={index === 0 ? first : null} className="chip" aria-pressed={picked.includes(reason)} onClick={() => toggle(reason)}>
              {reason}
            </button>
          ))}
        </div>
        <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
        <div className="cr">
          <button className="no" onClick={onClose}>{swiped ? "Skip" : "Go back"}</button>
          <button className="ok" onClick={() => onSave(picked, note.trim())}>{swiped ? "Add reasons" : `Save: ${choice.label}`}</button>
        </div>
      </div>
    </div>
  );
}

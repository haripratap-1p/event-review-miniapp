export const VERDICTS = {
  reject: [
    { value: "agree", label: "Agree", hint: "system was wrong", tone: "ok" },
    { value: "disagree", label: "Disagree", hint: "system was right", tone: "no" },
  ],
  bookmark: [
    { value: "valid", label: "Valid", hint: "real issue", tone: "ok" },
    { value: "invalid", label: "Not valid", hint: "nothing wrong", tone: "no" },
  ],
};

export const verdictLabel = (value) => Object.values(VERDICTS).flat().find((v) => v.value === value)?.label || value;

export default function VerdictBar({ kind, mine, onPick, onChange }) {
  return (
    <div className="verdict">
      <div className="inner">
        {mine ? (
          <div className="answered">
            <span>Your answer: {verdictLabel(mine)} ✓</span>
            <button className="linkbtn" onClick={onChange}>Change my answer</button>
          </div>
        ) : (
          <div className="cr">
            {VERDICTS[kind].map((v) => (
              <button key={v.value} className={v.tone} onClick={() => onPick(v.value)}>
                {v.label}
                <small>{v.hint}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

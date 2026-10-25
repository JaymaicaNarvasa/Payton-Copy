export type Notice = { type: "success" | "error"; message: string };

// Same look as the result dialog used in User Management.
export default function NoticeModal({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div className="ref-modal-overlay" role="dialog" aria-modal="true">
      <div className="ref-modal-content text-center">
        <div className={`ref-alert-icon-box ${notice.type}`}>{notice.type === "success" ? "✓" : "✕"}</div>
        <h3 className="ref-modal-title">{notice.type === "success" ? "Success!" : "Action Failed"}</h3>
        <p className="ref-modal-desc">{notice.message}</p>
        <div className="ref-modal-actions" style={{ justifyContent: "center" }}>
          <button className="ref-modal-btn-confirm success" style={{ width: "100%" }} onClick={onClose} autoFocus>
            Okay
          </button>
        </div>
      </div>
    </div>
  );
}

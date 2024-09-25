import {useEffect, useRef} from "react";

const Modal = ({ isOpen, children, close }) => {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.showModal();
    } else if (!isOpen && dialogRef.current) {
      dialogRef.current.close();
    }
  }, [isOpen]);

  return (
    <div className="overlayDialogModal" onClick={() => {close();}}>
      <dialog ref={dialogRef} className="dialogModal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          {children}
        </div>
      </dialog>
    </div>
  );
}

export default Modal;
import {useRef} from "react";

const Modal = ({ isOpen, children, close }) => {
  const dialogRef = useRef(null);

  if (isOpen) {
    dialogRef.current?.showModal();
  } else {
    dialogRef.current?.close();
  }

  return (
    <div className="overlayDialogModal" onClick={() => close()}>
      <dialog ref={dialogRef} className="dialogModal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          {children}
        </div>
      </dialog>
    </div>
  );
}

export default Modal;
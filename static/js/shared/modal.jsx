import {useRef} from "react";

const Modal = ({ isOpen, children }) => {
  const dialogRef = useRef(null);

  if (isOpen) {
    dialogRef.current?.showModal();
  } else {
    dialogRef.current?.close();
  }

  return (
    <div className="overlayDialogModal">
      <dialog ref={dialogRef} className="dialogModal">
        <div className="modal-content">
          {children}
        </div>
      </dialog>
    </div>
  );
}

export default Modal;
import {useRef} from "react";

const Modal = ({ isOpen, onClose, children }) => {
  const dialogRef = useRef(null);

  if (isOpen) {
    dialogRef.current?.showModal();
  } else {
    dialogRef.current?.close();
  }

  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-content">
        {children}
      </div>
    </dialog>
  );
}

export default Modal;
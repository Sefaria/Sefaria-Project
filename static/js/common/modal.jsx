import { useEffect, useRef } from "react";

const Modal = ({ children, close }) => {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (dialogRef.current) {
      dialogRef.current.showModal();
    }
    return () => {
      if (dialogRef.current) {
        dialogRef.current.close();
      }
  }}, []);

  const handleClickOutside = (e) => {
    if (dialogRef.current && e.target === dialogRef.current) {
      close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialogModal"
      onClick={handleClickOutside}
    >
      <div className="modal-content">
        {children}
      </div>
    </dialog>
  );
}

export default Modal;

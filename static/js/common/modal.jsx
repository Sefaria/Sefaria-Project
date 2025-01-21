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

  return (
    <dialog ref={dialogRef} className="dialogModal" onClick={(e) => e.preventDefault()}>
      <div className="modal-content" onClick={() => close()}>
        {children}
      </div>
    </dialog>
  );
}

export default Modal;

import Swal, { type SweetAlertIcon, type SweetAlertOptions, type SweetAlertResult } from "sweetalert2";

type BrandAlertOptions = {
  title?: string;
  text: string;
  confirmButtonText?: string;
};

type BrandConfirmOptions = {
  title?: string;
  text: string;
  icon?: SweetAlertIcon;
  confirmButtonText?: string;
  cancelButtonText?: string;
};

const brandAlert = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  background: "var(--color-surface)",
  color: "var(--color-dark)",
  iconColor: "var(--color-primary)",
  confirmButtonText: "Entendido",
  customClass: {
    popup: "brand-swal-popup",
    title: "brand-swal-title",
    htmlContainer: "brand-swal-content",
    confirmButton: "brand-swal-confirm",
    cancelButton: "brand-swal-cancel",
    actions: "brand-swal-actions",
    icon: "brand-swal-icon",
  },
});

function fireWithDefaults(
  icon: SweetAlertIcon,
  options: BrandAlertOptions,
): Promise<SweetAlertResult<unknown>> {
  return brandAlert.fire({
    icon,
    title: options.title,
    text: options.text,
    confirmButtonText: options.confirmButtonText,
  });
}

export const alerts = {
  success(options: BrandAlertOptions) {
    return fireWithDefaults("success", {
      title: options.title ?? "Listo",
      ...options,
    });
  },

  error(options: BrandAlertOptions) {
    return fireWithDefaults("error", {
      title: options.title ?? "No se pudo completar la acción",
      confirmButtonText: options.confirmButtonText ?? "Cerrar",
      ...options,
    });
  },

  warning(options: BrandAlertOptions) {
    return fireWithDefaults("warning", {
      title: options.title ?? "Atención",
      ...options,
    });
  },

  confirm(options: BrandConfirmOptions) {
    const modalOptions: SweetAlertOptions = {
      icon: options.icon ?? "warning",
      title: options.title ?? "¿Deseas continuar?",
      text: options.text,
      showCancelButton: true,
      focusCancel: true,
      confirmButtonText: options.confirmButtonText ?? "Sí, continuar",
      cancelButtonText: options.cancelButtonText ?? "Cancelar",
    };

    return brandAlert.fire(modalOptions);
  },
};

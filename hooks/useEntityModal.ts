import { useState, useEffect } from 'react';
import { Form, App } from 'antd';
import type { FormInstance } from 'antd';

export interface UseEntityModalOptions<TEntity, TFormValues> {
  open: boolean;
  entity?: TEntity | null;
  onClose: () => void;
  onSuccess: () => void;

  // URL generation
  getCreateUrl: () => string;
  getUpdateUrl: (entity: TEntity) => string;

  // Transform entity to form values
  entityToFormValues: (entity: TEntity) => TFormValues;

  // Transform form values to request body (optional - defaults to identity)
  formValuesToRequestBody?: (values: TFormValues, isEdit: boolean, entity?: TEntity) => unknown;

  // Success messages
  createSuccessMessage?: string;
  updateSuccessMessage?: string;
  errorMessage?: string;

  // Optional: default values for new entities
  getDefaultValues?: () => Partial<TFormValues>;
}

export interface UseEntityModalReturn<TFormValues> {
  form: FormInstance<TFormValues>;
  loading: boolean;
  isEdit: boolean;
  handleSubmit: (values: TFormValues) => Promise<void>;
}

/**
 * Generic hook for entity create/edit modals with fetch-based API calls.
 * Handles form management, loading state, initialization, and submit logic.
 */
export function useEntityModal<TEntity, TFormValues = Record<string, unknown>>({
  open,
  entity,
  onClose,
  onSuccess,
  getCreateUrl,
  getUpdateUrl,
  entityToFormValues,
  formValuesToRequestBody = (values) => values,
  createSuccessMessage = 'Created successfully',
  updateSuccessMessage = 'Updated successfully',
  errorMessage = 'Failed to save',
  getDefaultValues,
}: UseEntityModalOptions<TEntity, TFormValues>): UseEntityModalReturn<TFormValues> {
  const [form] = Form.useForm<TFormValues>();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const isEdit = !!entity;

  // Initialize form when modal opens
  useEffect(() => {
    if (open) {
      if (entity) {
        // Edit mode: populate from entity
        const values = entityToFormValues(entity);
        form.setFieldsValue(values as any);
      } else {
        // Create mode: reset and apply defaults
        form.resetFields();
        if (getDefaultValues) {
          const defaults = getDefaultValues();
          form.setFieldsValue(defaults as any);
        }
      }
    }
  }, [open, entity, form, entityToFormValues, getDefaultValues]);

  const handleSubmit = async (values: TFormValues): Promise<void> => {
    setLoading(true);
    try {
      const url = isEdit ? getUpdateUrl(entity!) : getCreateUrl();
      const body = formValuesToRequestBody(values, isEdit, entity ?? undefined);

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || errorMessage);
      }

      message.success(isEdit ? updateSuccessMessage : createSuccessMessage);
      onSuccess();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return {
    form,
    loading,
    isEdit,
    handleSubmit,
  };
}

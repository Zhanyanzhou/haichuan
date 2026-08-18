import { Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { ADMIN_COPY } from '@/constants/adminCopy';

interface BaseProps {
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  cancelText?: string;
}

interface StandardConfirmProps extends BaseProps {
  danger?: false;
  title?: string;
  content?: string;
  okText?: string;
}

interface DangerConfirmProps extends BaseProps {
  danger: true;
  title: string;
  content: string;
  okText: string;
}

type Props = StandardConfirmProps | DangerConfirmProps;

export function confirmAction(props: Props) {
  const danger = props.danger === true;
  const title = props.title ?? '继续此操作？';
  const content = props.content ?? '请确认当前信息无误。';
  const okText = props.okText ?? ADMIN_COPY.actions.continue;

  Modal.confirm({
    title,
    icon: <ExclamationCircleOutlined />,
    content,
    okText,
    cancelText: props.cancelText ?? ADMIN_COPY.actions.cancel,
    okButtonProps: danger ? { danger: true } : {},
    onOk: props.onConfirm,
    onCancel: props.onCancel,
  });
}

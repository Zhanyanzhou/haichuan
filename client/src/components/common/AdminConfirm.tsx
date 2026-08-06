import { Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

interface Props {
  title?: string;
  content?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  danger?: boolean;
}

export function confirmAction({
  title = '确认操作',
  content = '确定要执行此操作吗？',
  onConfirm,
  onCancel,
  danger = false,
}: Props) {
  Modal.confirm({
    title,
    icon: <ExclamationCircleOutlined />,
    content,
    okText: '确定',
    cancelText: '取消',
    okButtonProps: danger ? { danger: true } : {},
    onOk: onConfirm,
    onCancel,
  });
}

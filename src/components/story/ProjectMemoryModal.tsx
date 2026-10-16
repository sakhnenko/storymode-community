import { useProjectMemory } from '@/hooks/useProjectMemory';
import { ProjectMemoryPanel, type ProjectMemoryProps } from './ProjectMemoryPanel';

export function ProjectMemoryModal(props: ProjectMemoryProps) {
  const memory = useProjectMemory(props.projectId, props.open);
  return <ProjectMemoryPanel {...props} memory={memory} />;
}

import os
import re
from collections import defaultdict

def reduce_md_content(content, reduction_factor=0.1):
    """
    Reduce el contenido MD manteniendo la estructura importante.
    """
    # Conservar encabezados y código
    important_lines = []
    lines = content.split('\n')
    
    for line in lines:
        # Mantener todos los encabezados
        if line.startswith('#') or line.startswith('##') or line.startswith('###'):
            important_lines.append(line)
        # Mantener bloques de código
        elif line.strip().startswith('```'):
            important_lines.append(line)
        # Mantener algunas líneas de texto normal (muestreo)
        elif line.strip() and len(important_lines) < len(lines) * reduction_factor:
            # Acortar líneas largas
            shortened = line[:100] + '...' if len(line) > 100 else line
            important_lines.append(shortened)
    
    return '\n'.join(important_lines)

def combine_and_reduce_md_files(input_folder, output_file, files_per_batch=10):
    """
    Combina y reduce archivos MD en lotes.
    """
    md_files = [f for f in os.listdir(input_folder) if f.endswith('.md')]
    batches = [md_files[i:i + files_per_batch] for i in range(0, len(md_files), files_per_batch)]
    
    for i, batch in enumerate(batches):
        combined_content = []
        for filename in batch:
            with open(os.path.join(input_folder, filename), 'r', encoding='utf-8') as f:
                content = f.read()
                reduced = reduce_md_content(content)
                combined_content.append(f"\n\n--- ARCHIVO: {filename} ---\n\n{reduced}")
        
        output_filename = f"{output_file}_batch_{i+1}.md"
        with open(output_filename, 'w', encoding='utf-8') as f:
            f.write('\n'.join(combined_content))
        
        print(f"Batch {i+1} creado: {output_filename} - Archivos procesados: {', '.join(batch)}")

if __name__ == "__main__":
    input_folder = "knowbase"  # Cambia esto a tu ruta real
    output_file = "combinado_reducido"
    
    combine_and_reduce_md_files(input_folder, output_file)
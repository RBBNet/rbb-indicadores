from os import makedirs
import os
import re
import pandas as pd
from datetime import datetime
import warnings
import shutil

#Constantes
ANDAMENTO = 'Andamento'
SEM_ANDAMENTO = 'Sem_andamento'
NAO_INICIADO = 'Nao_iniciado'
ENCERRADO = 'Encerrado'

"""
Função para filtrar o dataframe contendo 
os eventos de timeline e as issues.
Mantém apenas uma ocorrência 
de maior valor por mês,
"""

def filter_merged_df(merged_df):
	

    merged_df['event_created_at'] = pd.to_datetime(merged_df['event_created_at'])
    merged_df['month'] = merged_df['event_created_at'].dt.to_period('M')
    merged_df = merged_df.sort_values(by=['issue_id', 'month', 'progress'], ascending=[True, True, False])

    filtered_df = merged_df.drop_duplicates(subset=['iniciativa_id', 'month'], keep='first')
    filtered_df = filtered_df.drop(columns=['month'])

    return filtered_df


"""
Função para interpretar a coluna de IDs das iniciativas
"""
def fetchIDs(iniciativa_id):
	IDs = (((iniciativa_id.replace("][", "#")).replace("[","#")).replace("]","#")).split("#")[1:3]

	return IDs


def string_to_date(periodo):
	return datetime.strptime(str(periodo),"%m/%Y")


def check_previous_progress(colunas,date, iniciativas, iniciativa_index):
	current_col_index = colunas.get_loc(date)
	left_columns = colunas[:current_col_index]
	has_any_progress_before_date = any(iniciativas.loc[iniciativa_index, col] == ANDAMENTO  or iniciativas.loc[iniciativa_index, col] == SEM_ANDAMENTO for col in left_columns)
	finished_before_date = any(iniciativas.loc[iniciativa_index, col] == ENCERRADO for col in left_columns)
	if has_any_progress_before_date:
		return NAO_INICIADO
	elif finished_before_date:
		return ENCERRADO
	else:     
		return SEM_ANDAMENTO


def load_files():
	print("\nAcessando arquivos com metadados...")

	files = ['./tmp/Indicadores.xlsx', './tmp/Issues.csv', './tmp/Comentarios.csv']
	
	for file in files:
		print(f' - {file}')

	iniciativas = pd.read_excel(files[0], sheet_name='Andamento Iniciativas', engine='openpyxl')
	issues = pd.read_csv(files[1], sep=';')
	timeline = pd.read_csv(files[2], sep=';')

	return iniciativas, issues, timeline
	
"""
Se não há eventos de timeline para as issues encontradas:
	- Marcar o mês corrente como sem progresso, código NAO_INICIADO.
Se não há eventos de timeline para as issues encontradas mas 
	há progresso anterior
		- Marcar o mês corrente como sem progresso, código NAO_INICIADO.

Se há eventos de timeline para as issues encontradas, buscar progresso:
	NAO_INICIADO: Não há Progresso anterior, Progresso não encontrado, #andamento não encontrada.
	SEM_ANDAMENTO: Há Progresso anterior, Progresso não encontrado, #andamento não encontrada
	ANDAMENTO: Há Progresso anterior, Progresso encontrado, #andamento encontrada
"""

def main(periodo):
	warnings.filterwarnings("ignore", category=UserWarning)

	mes_corrente = string_to_date(periodo)
	iniciativas, issues, timeline = load_files()

	print("\nMerging issues e timeline...")
	merged_issues_timeline = pd.merge(timeline, issues, on='issue_id', how='left')

	# obtendo os cabeçalhos das colunas de data
	colunas = pd.to_datetime(iniciativas.columns[3:])
	
	"""
	Se merged_issues_timeline.empty

	Então olhar passado e atribuir valor.
		'Nao_iniciado' ou 'Sem_andamento'
	"""

	if issues.empty:
		print('\nNenhuma issue encontrada no Kanbam requisitado.\n - Verifique a ortografia ou a existência do Projeto.')
		exit(1)

	if merged_issues_timeline.empty:
		print('\nNenhum evento de timeline encontrado. Issues sem reports de evolução para o mês corrente')

		for index_iniciativa, iniciativa_id in iniciativas['ID'].items():
			if pd.isna(iniciativa_id):
				continue
			
			IDs = fetchIDs(str(iniciativa_id))
			
			if IDs.__len__() == 2:
				print(f'\n Identificadores corretos: {IDs}\n - buscando issues para esse conjunto')
				for index, row in issues.iterrows():
					title = str(row['title'])

					if (f'[{IDs[0]}]' in title) and (f'[{IDs[1]}]' in title):
						for date in colunas:
								if date.month == mes_corrente.month:
									iniciativas.loc[index_iniciativa, date] = NAO_INICIADO
			else:
				print(f'\nIdentificadores incorretos: {IDs}\n - Não foi possível buscar issues para esse conjunto de IDs')

		iniciativas.to_csv('./tmp/iniciativas_updated.csv',sep =';', index=False)
		
	else:
		merged_issues_timeline['iniciativa_id'] = ''
		merged_issues_timeline['progress'] = ''

		print("\nBuscando Progresso nas Issues...")

		# Cria um DataFrame temporário para armazenar os resultados
		temp_df = pd.DataFrame(columns=['index', 'iniciativa_id', 'progress'])

		for iniciativa_id in iniciativas['ID']:
			if pd.isna(iniciativa_id):
				continue
			
			IDs = fetchIDs(str(iniciativa_id))
			
			if len(IDs) == 2:
				mask = merged_issues_timeline['title'].str.contains(re.escape(f'[{IDs[0]}]')) & merged_issues_timeline['title'].str.contains(re.escape(f'[{IDs[1]}]'))
				filtered_rows = merged_issues_timeline[mask]

				for index, row in filtered_rows.iterrows():
					print(f' - Encontrada issue e evento de comentário para a Iniciativa com ID {iniciativa_id}, buscando #andamento..')

					if '#andamento' in row['body']:
						print(f'  - #andamento encontrada para esse comentário da issue')
						temp_df = pd.concat([temp_df, pd.DataFrame({'index': [index], 'iniciativa_id': [iniciativa_id], 'progress': [ANDAMENTO]})], ignore_index=True)
					else:
						print(f'  - #andamento não encontrada para esse comentário da issue')
						temp_df = pd.concat([temp_df, pd.DataFrame({'index': [index], 'iniciativa_id': [iniciativa_id], 'progress': [NAO_INICIADO]})], ignore_index=True)

		# Atualiza o DataFrame original com os resultados
		for _, row in temp_df.iterrows():
			merged_issues_timeline.at[row['index'], 'iniciativa_id'] = row['iniciativa_id']
			# Converte explicitamente o valor de 'progress' para string
			merged_issues_timeline.at[row['index'], 'progress'] = str(row['progress'])

		print('\nFiltrando eventos para eliminar valores conflitantes...')
		filtered_df = filter_merged_df(merged_issues_timeline)

		print('\nAtribuindo progresso às iniciativas...')
		for iniciativa_id in iniciativas['ID']:
			if pd.isna(iniciativa_id):
				continue

			#buscando eventos associados ao ID em questão
			hasPair = False
			for index, row in filtered_df.iterrows():
				if iniciativa_id == row['iniciativa_id']:

					print(f'\n - Encontrado evento válido de comentário para a Iniciativa com ID {iniciativa_id}')
					
					hasPair = True
					iniciativa_index = iniciativas[iniciativas['ID'] == row['iniciativa_id']].index[0]
					event_creation = datetime.fromisoformat(str(row['event_created_at']))
					
					if event_creation.month == mes_corrente.month and event_creation.year == mes_corrente.year:
						for date in colunas:
							if date.month == event_creation.month and date.year == event_creation.year:
								print(f"  - Atualizando iniciativa com ID {iniciativa_id} no mês: {date.month}/{date.year}")
								if row['progress'] == SEM_ANDAMENTO:
									if check_previous_progress(colunas, date, iniciativas, iniciativa_index):
										print(f"  - há progresso anterior para a iniciativa, atualizando com Sem_Andamento")
										iniciativas.loc[iniciativa_index, date] = SEM_ANDAMENTO
										break
									else:
										print(f"  - Não há progresso anterior para a iniciativa, atualizando com {row['progress']}")
										iniciativas.loc[iniciativa_index, date] = row['progress']
										break
								else:
									print(f"  - há progresso para a iniciativa, atualizando com {row['progress']}")
									iniciativas.loc[iniciativa_index, date] = row['progress']
									break

			# Não há issue associada ao ID em questão			
			if not hasPair:
				print(f'\n - Não há eventos de comentário para a Iniciativa com ID {iniciativa_id}')
				iniciativa_index = iniciativas[iniciativas['ID'] == iniciativa_id].index[0]
				for date in colunas:
					if date.month == mes_corrente.month and date.year == mes_corrente.year:
						print(f"  - Atualizando iniciativa com ID {iniciativa_id} no mês: {date.month}/{date.year}")
	
						if check_previous_progress(colunas, date, iniciativas, iniciativa_index):
							print(f"  - há progresso anterior para a iniciativa, atualizando com Sem_andamento")
							iniciativas.loc[iniciativa_index, date] = SEM_ANDAMENTO
							break
						elif print(f"  - Não há progresso anterior para a iniciativa, atualizando com Nao_iniciada"):
							iniciativas.loc[iniciativa_index, date] = NAO_INICIADO
							break
			
					  
	# atualizar arquivos com metadados das iniciativas
	resultFileName = './result/iniciativas_updated.csv'
	print(f'\nSalvando alterações nas Iniciativas no arquivo: {resultFileName}')

	iniciativas.to_csv(resultFileName,sep =';', index=False)

periodo = '01/2025'
main(periodo)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from pymongo import MongoClient

# ===== Neo4j 접속 정보 및 클래스 =====
NEO4J_URI = "bolt://223.195.38.211:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "milab123"

class Neo4jConnector:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def fetch_nodes(self):
        query = "MATCH (n) RETURN n LIMIT 100"
        with self.driver.session() as session:
            result = session.run(query)
            nodes = []
            for record in result:
                n = record["n"]
                data = dict(n)
                # 좌표 필드(필드명 변경 예정)
                if "lat" in data and "lng" in data:
                    nodes.append({
                        "id": str(data.get("id", "")),
                        "city": data.get("name", ""),
                        "lat": data["lat"],
                        "lng": data["lng"],
                        "label": "!"
                    })
            return nodes

# ===== MongoDB 접속 정보 및 함수 =====
MONGO_URI = "mongodb+srv://lovea:milab123@cluster0.zvlayyo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DATABASE_NAME = "sample_mflix"
COLLECTION_NAME = "movies"

def fetch_mongo_markers():
    client = MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    collection = db[COLLECTION_NAME]
    data = []
    for doc in collection.find().limit(10):
        # 실제로 좌표(lat/lng) 필드가 있는 도큐먼트만 마커로 변환!
        # 예시: country 필드에 따라 임의로 위·경도 부여 (실무땐 실제 값 사용)
        if "country" in doc:
            city = doc.get("country")   # 실제 도시명 필드가 있다면 그걸로!
            lat, lng = 37.5665, 126.9780
            data.append({
                "id": str(doc.get("_id", "")),
                "city": city,
                "lat": lat,
                "lng": lng,
                "label": "!"
            })
    client.close()
    return data

# ===== FastAPI 앱 및 CORS =====
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 시 전체 허용, 운영 시엔 안전한 도메인으로 제한!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 엔드포인트: Neo4j =====
@app.get("/neo4j/nodes")
def get_neo4j_nodes():
    neo4j_conn = Neo4jConnector(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)
    try:
        nodes = neo4j_conn.fetch_nodes()
        return nodes
    finally:
        neo4j_conn.close()

# ===== 엔드포인트: MongoDB =====
@app.get("/mongo/movies")
def get_mongo_markers():
    return fetch_mongo_markers()


# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
# from neo4j import GraphDatabase
# from pymongo import MongoClient

# # Neo4j 연결 설정 및 클래스
# class Neo4jConnector:
#     def __init__(self):  # 생성자: 연결 정보 설정
#         self.driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "1234"))

#     def close(self):  # 연결 종료
#         self.driver.close()

#     def fetch_nodes(self):
#         with self.driver.session() as session:
#             result = session.run("MATCH (n:City) RETURN n.city AS city, n.lat AS lat, n.lng AS lng")
#             markers = []
#             for record in result:
#                 markers.append({
#                     "city": record["city"],
#                     "lat": record["lat"],
#                     "lng": record["lng"]
#                 })
#             return markers

# # MongoDB 연결 설정 및 클래스
# class MongoDBConnector:
#     def __init__(self):
#         self.client = MongoClient("mongodb://localhost:27017/")
#         self.db = self.client["test"]
#         self.movies_collection = self.db["movies"]

#     def fetch_movies(self):
#         return list(self.movies_collection.find({}, {"_id": 0, "title": 1, "director": 1}))

# # FastAPI 앱 생성
# app = FastAPI()

# # CORS 모든 도메인 허용 설정
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # 네오4j 인스턴스 생성
# neo4j_connector = Neo4jConnector()

# # 몽고디비 인스턴스 생성
# mongo_connector = MongoDBConnector()

# # Neo4j 노드 데이터 반환 API
# @app.get("/neo4j/nodes")
# def get_neo4j_nodes():
#     return neo4j_connector.fetch_nodes()

# # MongoDB 영화 데이터 반환 API
# @app.get("/mongo/movies")
# def get_mongo_movies():
#     return mongo_connector.fetch_movies()
